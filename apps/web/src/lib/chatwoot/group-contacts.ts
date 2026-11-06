import { chatwootRequest } from "./client";
import { listRegistryGroups } from "@/lib/evolution/chat-registry";
import { getRedis } from "@/lib/redis";

// Fork Valcenter (2026-11): registra o GRUPO no Chatwoot sem esperar a 1a mensagem.
//
// A integracao da Evolution so cria contato + conversa quando passa uma mensagem, entao
// grupo novo e mudo ficava invisivel: nem em Contatos, nem com onde enviar. Usamos o
// MESMO formato dela (identifier = JID, nome "<assunto> (GROUP)"): quando a 1a mensagem
// chegar, a Evolution acha este contato (busca por identifier) e reusa a conversa
// aberta da caixa, sem duplicar.

interface CwContact {
  id: number;
  identifier?: string | null;
  contact_inboxes?: { inbox?: { id?: number } | null }[];
}

async function findGroupContact(accountId: number, jid: string): Promise<CwContact | null> {
  const res = await chatwootRequest<{ payload?: CwContact[] }>({
    accountId,
    path: `/contacts/search?q=${encodeURIComponent(jid)}&include_contact_inboxes=true`,
  });
  return res.payload?.find((c) => c.identifier === jid) ?? null;
}

// Garante o contato do grupo E o vinculo dele com a caixa. Idempotente. Grupo com
// mais de um numero nosso tem UM contato na conta (identifier e unico por conta),
// ligado a cada caixa.
export async function ensureGroupContact(
  accountId: number,
  inboxId: number,
  jid: string,
  subject: string,
): Promise<number> {
  let contact = await findGroupContact(accountId, jid);
  if (!contact) {
    try {
      const created = await chatwootRequest<{ payload?: { contact?: CwContact } }>({
        accountId,
        method: "POST",
        path: "/contacts",
        body: { inbox_id: inboxId, name: `${subject} (GROUP)`, identifier: jid },
      });
      const id = created.payload?.contact?.id;
      if (id) return id; // o create ja liga o contato a caixa
    } catch (err) {
      // 422 = a Evolution criou o mesmo contato no meio tempo (msg chegou agora)
      if (!String((err as Error)?.message).includes(" 422")) throw err;
    }
    contact = await findGroupContact(accountId, jid);
    if (!contact) throw new Error("Chatwoot API error: contato do grupo nao foi criado");
  }
  if (!contact.contact_inboxes?.some((ci) => ci.inbox?.id === inboxId)) {
    await chatwootRequest({
      accountId,
      method: "POST",
      path: `/contacts/${contact.id}/contact_inboxes`,
      body: { inbox_id: inboxId },
    });
  }
  return contact.id;
}

// Abre (ou reusa) a conversa do grupo na caixa, atribuida a quem criou o grupo.
// Devolve o numero da conversa (display_id).
export async function openGroupConversation(
  accountId: number,
  inboxId: number,
  contactId: number,
  assigneeId: number,
): Promise<number | null> {
  const list = await chatwootRequest<{ payload?: { id: number; inbox_id: number; status: string }[] }>({
    accountId,
    path: `/contacts/${contactId}/conversations`,
  });
  const open = list.payload?.find((c) => c.inbox_id === inboxId && c.status !== "resolved");
  if (open) return open.id;
  const conv = await chatwootRequest<{ id?: number }>({
    accountId,
    method: "POST",
    path: "/conversations",
    body: {
      contact_id: contactId,
      inbox_id: inboxId,
      status: "open",
      ...(assigneeId > 0 ? { assignee_id: assigneeId } : {}),
    },
  });
  return conv.id ?? null;
}

// Grupos que a Evolution viu a partir desta data entram no Chatwoot (so o CONTATO,
// sem abrir conversa, pra nao lotar a lista). 20/10/2026 recupera os grupos que
// ficaram invisiveis antes desta correcao; os mais antigos ja passaram por la.
const SYNC_SINCE_MS = Date.parse("2026-10-20T00:00:00-03:00");
const MAX_PER_CYCLE = 25; // gentil com o Chatwoot; o resto vai no proximo ciclo

function syncedKey(accountId: number, inboxId: number): string {
  return `cmv:groups:cw-synced:${accountId}:${inboxId}`;
}

export async function markGroupSynced(accountId: number, inboxId: number, jid: string): Promise<void> {
  await getRedis()?.sadd(syncedKey(accountId, inboxId), jid).catch(() => 0);
}

// Chamado pelo aquecedor (de 20 em 20 min). Cobre o que a criacao pela Gestao nao
// cobre: grupo criado pelo celular, numero adicionado por outra pessoa, ou criacao
// cujo registro no Chatwoot falhou. Sem Redis nao ha memoria do que ja foi feito,
// entao nao faz nada (melhor que repetir chamadas a cada ciclo).
export async function syncNewGroupContacts(
  instance: string,
  accountId: number,
  inboxId: number,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  const groups = await listRegistryGroups(instance);
  if (!groups) return;
  const fresh = groups
    .filter((g) => g.createdAt >= SYNC_SINCE_MS && g.subject)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (fresh.length === 0) return;
  const done = new Set(await r.smembers(syncedKey(accountId, inboxId)));
  let budget = MAX_PER_CYCLE;
  for (const g of fresh) {
    if (done.has(g.id)) continue;
    if (budget-- <= 0) break;
    try {
      await ensureGroupContact(accountId, inboxId, g.id, g.subject);
      await markGroupSynced(accountId, inboxId, g.id);
    } catch (err) {
      const msg = String((err as Error)?.message ?? err);
      console.warn(`[groups-sync] ${instance}: ${g.id} nao registrado no Chatwoot: ${msg.slice(0, 160)}`);
      // sem acesso a conta (token de outra conta): para aqui, tenta no proximo ciclo
      if (/Chatwoot API error 40[134]/.test(msg)) return;
    }
  }
}
