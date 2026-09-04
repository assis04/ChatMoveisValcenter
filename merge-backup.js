#!/usr/bin/env node
'use strict';
// Mescla conversas de uma inbox de um backup (SRC) para uma inbox de produção
// (DST), aditivamente e SEM duplicar: dedup de mensagens por source_id, contatos
// por identifier/telefone. Preserva metadados (status/assignee/team/timestamps).
// Só cria a conversa se ela tiver >=1 mensagem NOVA (evita conversa vazia no overlap).
//
// DRY-RUN por padrão (só conta). Grava com --commit, tudo numa transação.
//
// env: SRC_DATABASE_URI (backup restaurado), DST_DATABASE_URI (destino)
// args: --src-inbox 13 --dst-inbox 15 --account 1 [--commit]
const { Client } = require('pg');

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const key = k.slice(2), next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) a[key] = true;
    else { a[key] = next; i++; }
  }
  return a;
}
const args = parseArgs(process.argv);
const SRC_INBOX = parseInt(args['src-inbox'], 10);
const DST_INBOX = parseInt(args['dst-inbox'], 10);
const ACCOUNT = parseInt(args.account, 10);
const COMMIT = !!args.commit;
function die(m) { console.error('ERRO:', m); process.exit(1); }
if (!Number.isInteger(SRC_INBOX)) die('--src-inbox obrigatorio');
if (!Number.isInteger(DST_INBOX)) die('--dst-inbox obrigatorio');
if (!Number.isInteger(ACCOUNT)) die('--account obrigatorio');
const SRC_URI = process.env.SRC_DATABASE_URI, DST_URI = process.env.DST_DATABASE_URI;
if (!SRC_URI) die('SRC_DATABASE_URI ausente');
if (!DST_URI) die('DST_DATABASE_URI ausente');

// jsonb: node-pg nao serializa objeto sozinho -> stringify (ou null)
const js = (v) => (v === null || v === undefined ? null : JSON.stringify(v));

(async () => {
  const src = new Client({ connectionString: SRC_URI });
  const dst = new Client({ connectionString: DST_URI });
  await src.connect(); await dst.connect();
  await src.query("SET TIME ZONE 'UTC'");
  await dst.query("SET TIME ZONE 'UTC'");

  const st = {
    convs_src: 0, convs_criadas: 0, convs_puladas_vazias: 0,
    msgs_inseridas: 0, msgs_dup: 0, contatos_criados: 0, contatos_reusados: 0, ci_criados: 0,
  };

  const convs = (await src.query(
    `SELECT c.id, c.status, c.assignee_id, c.team_id, c.priority,
            c.additional_attributes AS c_addl, c.custom_attributes AS c_custom,
            c.created_at, c.updated_at, c.last_activity_at,
            ci.source_id AS ci_source_id, ci.hmac_verified AS ci_hmac,
            ct.id AS ct_id, ct.name AS ct_name, ct.email AS ct_email, ct.phone_number AS ct_phone,
            ct.identifier AS ct_identifier, ct.additional_attributes AS ct_addl, ct.custom_attributes AS ct_custom,
            ct.created_at AS ct_created, ct.updated_at AS ct_updated
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id
       LEFT JOIN contact_inboxes ci ON ci.id = c.contact_inbox_id
      WHERE c.inbox_id = $1 AND c.account_id = $2
      ORDER BY c.id`,
    [SRC_INBOX, ACCOUNT]
  )).rows;
  st.convs_src = convs.length;

  if (COMMIT) await dst.query('BEGIN');
  try {
    for (const cv of convs) {
      const msgs = (await src.query(
        `SELECT content, message_type, private, status, source_id, content_type,
                content_attributes, sender_type, sender_id, external_source_ids,
                additional_attributes, created_at, updated_at
           FROM messages WHERE conversation_id = $1 ORDER BY id`,
        [cv.id]
      )).rows;

      // dedup por source_id ja existente na inbox destino
      const srcIds = msgs.map((m) => m.source_id).filter(Boolean);
      let existing = new Set();
      if (srcIds.length) {
        const ex = (await dst.query(
          `SELECT source_id FROM messages WHERE inbox_id = $1 AND source_id = ANY($2)`,
          [DST_INBOX, srcIds]
        )).rows;
        existing = new Set(ex.map((r) => r.source_id));
      }
      const novas = msgs.filter((m) => !m.source_id || !existing.has(m.source_id));
      st.msgs_dup += msgs.length - novas.length;
      if (novas.length === 0) { st.convs_puladas_vazias++; continue; }

      // contato: acha por identifier, senao por telefone, senao cria
      let dstContactId = null;
      let f = cv.ct_identifier
        ? (await dst.query(`SELECT id FROM contacts WHERE account_id=$1 AND identifier=$2 LIMIT 1`, [ACCOUNT, cv.ct_identifier])).rows[0]
        : null;
      if (!f && cv.ct_phone) f = (await dst.query(`SELECT id FROM contacts WHERE account_id=$1 AND phone_number=$2 LIMIT 1`, [ACCOUNT, cv.ct_phone])).rows[0];
      if (f) { dstContactId = f.id; st.contatos_reusados++; }
      else {
        st.contatos_criados++;
        if (COMMIT) {
          dstContactId = (await dst.query(
            `INSERT INTO contacts (name,email,phone_number,account_id,identifier,additional_attributes,custom_attributes,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
            [cv.ct_name, cv.ct_email, cv.ct_phone, ACCOUNT, cv.ct_identifier, js(cv.ct_addl), js(cv.ct_custom), cv.ct_created, cv.ct_updated]
          )).rows[0].id;
        }
      }

      // contact_inbox (contato, inbox destino)
      let dstCiId = null;
      if (COMMIT) {
        const fci = (await dst.query(`SELECT id FROM contact_inboxes WHERE contact_id=$1 AND inbox_id=$2 LIMIT 1`, [dstContactId, DST_INBOX])).rows[0];
        if (fci) dstCiId = fci.id;
        else {
          st.ci_criados++;
          dstCiId = (await dst.query(
            `INSERT INTO contact_inboxes (contact_id,inbox_id,source_id,hmac_verified,pubsub_token,created_at,updated_at)
             VALUES ($1,$2,$3,$4,encode(gen_random_bytes(12),'hex'),$5,$6) RETURNING id`,
            [dstContactId, DST_INBOX, cv.ci_source_id || cv.ct_identifier || String(cv.ct_id), cv.ci_hmac || false, cv.created_at, cv.updated_at]
          )).rows[0].id;
        }
      } else { st.ci_criados++; }

      // conversa (metadados; display_id via trigger; uuid default)
      let dstConvId = null;
      if (COMMIT) {
        dstConvId = (await dst.query(
          `INSERT INTO conversations
             (account_id,inbox_id,status,assignee_id,contact_id,contact_inbox_id,team_id,priority,
              additional_attributes,custom_attributes,created_at,updated_at,last_activity_at,uuid)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,gen_random_uuid()) RETURNING id`,
          [ACCOUNT, DST_INBOX, cv.status, cv.assignee_id, dstContactId, dstCiId, cv.team_id, cv.priority,
           js(cv.c_addl), js(cv.c_custom), cv.created_at, cv.updated_at, cv.last_activity_at || cv.created_at]
        )).rows[0].id;
      }
      st.convs_criadas++;

      // mensagens novas
      for (const m of novas) {
        let senderId = m.sender_id;
        if (m.sender_type === 'Contact') senderId = dstContactId; // remapeia p/ contato do destino
        if (COMMIT) {
          await dst.query(
            `INSERT INTO messages
               (content,account_id,inbox_id,conversation_id,message_type,private,status,source_id,
                content_type,content_attributes,sender_type,sender_id,external_source_ids,additional_attributes,created_at,updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
            [m.content, ACCOUNT, DST_INBOX, dstConvId, m.message_type, m.private, m.status, m.source_id,
             m.content_type, js(m.content_attributes), m.sender_type, senderId, js(m.external_source_ids), js(m.additional_attributes), m.created_at, m.updated_at]
          );
        }
        st.msgs_inseridas++;
      }
    }
    if (COMMIT) await dst.query('COMMIT');
  } catch (e) {
    if (COMMIT) await dst.query('ROLLBACK');
    throw e;
  }

  console.log((COMMIT ? '*** COMMIT ***' : '--- DRY-RUN (nao grava) ---'));
  console.log(JSON.stringify(st, null, 2));
  await src.end(); await dst.end();
})().catch((e) => { console.error('ERRO', e.stack || e.message); process.exit(1); });
