import postgres from "postgres";

// Fork Valcenter (2026-11): registro de grupos que NAO depende de mensagem.
//
// A Evolution grava na tabela "Chat" todo grupo de que o numero participa assim que
// o WhatsApp avisa (criado pela Gestao, pelo celular ou quando alguem adiciona o
// numero), mesmo sem nenhuma mensagem. Ja o /chat/findChats da API le a tabela de
// MENSAGENS, e nao existe rota que leia a "Chat". Sem isto, grupo novo e mudo nao
// existia pro sistema. Lemos o banco direto, com um usuario SO-LEITURA que so
// enxerga as colunas usadas aqui. Zero chamada ao WhatsApp.
//
// Sem EVOLUTION_DB_URL o registro fica desligado (null) e a lista volta a ser so o
// findChats, como antes.

export interface RegistryGroup {
  id: string; // <jid>@g.us
  subject: string; // nome do grupo ("" se a Evolution nao souber)
  createdAt: number; // epoch ms: quando a Evolution viu o grupo pela 1a vez
  updatedAt: number; // epoch ms
}

let sql: postgres.Sql | null = null;

function db(): postgres.Sql | null {
  const url = process.env.EVOLUTION_DB_URL;
  if (!url) return null;
  sql ??= postgres(url, {
    max: 2,
    idle_timeout: 60,
    connect_timeout: 5,
    prepare: false,
    connection: { application_name: "gestao-grupos", statement_timeout: 10_000 },
  });
  return sql;
}

export function registryEnabled(): boolean {
  return Boolean(process.env.EVOLUTION_DB_URL);
}

// Grupos da instancia (por NOME, como o resto do app). null = registro desligado.
// Erro de banco propaga: o chamador decide (a lista mantem a ultima versao boa).
export async function listRegistryGroups(
  instance: string,
): Promise<RegistryGroup[] | null> {
  const q = db();
  if (!q) return null;
  const rows = await q<
    { remoteJid: string; name: string | null; createdAt: Date | null; updatedAt: Date | null }[]
  >`
    SELECT c."remoteJid", c.name, c."createdAt", c."updatedAt"
    FROM "Chat" c JOIN "Instance" i ON i.id = c."instanceId"
    WHERE i.name = ${instance} AND c."remoteJid" LIKE '%@g.us'
  `;
  const byJid = new Map<string, RegistryGroup>();
  for (const r of rows) {
    const createdAt = r.createdAt?.getTime() ?? 0;
    const prev = byJid.get(r.remoteJid);
    // A tabela pode ter linha repetida pro mesmo grupo: fica a mais antiga
    // (data real de entrada) com o nome mais recente que houver.
    byJid.set(r.remoteJid, {
      id: r.remoteJid,
      subject: (r.name ?? "").trim() || prev?.subject || "",
      createdAt: prev ? Math.min(prev.createdAt, createdAt) : createdAt,
      updatedAt: Math.max(prev?.updatedAt ?? 0, r.updatedAt?.getTime() ?? createdAt),
    });
  }
  return [...byJid.values()];
}
