import { fetchAllGroups } from "./groups";
import { getRedis } from "@/lib/redis";
import type { EvolutionGroup } from "@/types";

// Cache do fetchAllGroups (Evolution/Baileys), extraido de app/api/groups/route.ts
// pra virar FONTE UNICA: tanto a rota GET quanto o auto-aquecedor (instrumentation)
// usam exatamente este mesmo cache/fetch, entao nunca desincronizam.
//
// fetchAllGroups consulta metadata por grupo via Baileys e pode levar 60-120s em
// inboxes com centenas de grupos. Memoizamos por (instance, includeParticipants)
// com TTL curto pra absorver re-listagens frequentes da UI (foco do tab, abrir
// modal, etc.). Stale-while-revalidate: servimos o cache na hora (mesmo levemente
// velho) e revalidamos em BACKGROUND (fire-and-forget), pra o usuario nunca esperar
// os 125s+. So a primeirissima carga (sem cache em L1 nem L2) bloqueia — e o
// auto-aquecedor (groups-warmer) pre-popula pra evitar ate isso.
const GROUPS_FRESH_MS = 30 * 60_000; // apos isso, revalida em background
type CacheKey = string;
type CacheEntry = {
  value: EvolutionGroup[];
  fetchedAt: number; // 0 = nunca teve fetch bem-sucedido
  inflight?: Promise<EvolutionGroup[]>;
};
const groupsCache = new Map<CacheKey, CacheEntry>();

// Grupos criados pela Gestao nos ultimos minutos: seguram lugar na lista ate a
// Evolution grava-los na tabela "Chat" (normalmente em segundos).
const JUST_CREATED_MS = 10 * 60_000;
const justCreated = new Map<string, number>();

function isJustCreated(jid: string): boolean {
  const at = justCreated.get(jid);
  if (at === undefined) return false;
  if (Date.now() - at < JUST_CREATED_MS) return true;
  justCreated.delete(jid);
  return false;
}

export function cacheKey(instance: string, includeParticipants: boolean): CacheKey {
  return `${instance}|${includeParticipants ? 1 : 0}`;
}

// ─── Camada L2: Redis (persistente entre deploys/restarts) ────
// O cache em memoria (L1) morre a cada deploy do container. O Redis persiste,
// entao apos aquecer UMA vez, todo deploy futuro serve na hora em vez de
// esperar os ~3min do fetchAllGroups.
const REDIS_TTL_S = 24 * 3600; // 24h; revalidamos em background bem antes disso

function redisKey(key: CacheKey): string {
  return `cmv:groups:${key}`;
}

async function readRedis(key: CacheKey): Promise<CacheEntry | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get(redisKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      value: EvolutionGroup[];
      fetchedAt: number;
    };
    if (!Array.isArray(parsed.value) || !parsed.fetchedAt) return null;
    return { value: parsed.value, fetchedAt: parsed.fetchedAt };
  } catch {
    return null;
  }
}

function writeRedis(
  key: CacheKey,
  value: EvolutionGroup[],
  fetchedAt: number,
): void {
  const r = getRedis();
  if (!r) return;
  void r
    .set(redisKey(key), JSON.stringify({ value, fetchedAt }), "EX", REDIS_TTL_S)
    .catch(() => {});
}

export function refreshGroups(
  key: CacheKey,
  instance: string,
  includeParticipants: boolean,
): Promise<EvolutionGroup[]> {
  const current = groupsCache.get(key);
  if (current?.inflight) return current.inflight;

  const inflight = fetchAllGroups(instance, includeParticipants)
    .then((value) => {
      const fetchedAt = Date.now();
      // Fork Valcenter (2026-11): a lista agora vem COMPLETA (registro "Chat" +
      // findChats) e, se uma fonte falha, o fetchAllGroups lanca e o catch abaixo
      // mantem a ultima lista boa. Por isso saiu a antiga regra "nao troca por uma
      // lista menor": ela congelava a lista velha e, apos um restart, deixava o
      // findChats sozinho apagar os grupos sem mensagem. So preservamos os grupos
      // recem-criados que a Evolution talvez ainda nao tenha gravado.
      const prev = groupsCache.get(key);
      const ids = new Set(value.map((g) => g.id));
      const pending = (prev?.value ?? []).filter(
        (g) => !ids.has(g.id) && isJustCreated(g.id),
      );
      const chosen = pending.length ? [...pending, ...value] : value;
      groupsCache.set(key, { value: chosen, fetchedAt });
      writeRedis(key, chosen, fetchedAt); // persiste no L2 pra sobreviver a deploys
      return chosen;
    })
    .catch((err) => {
      // mantem o valor velho (se houver); so limpa o inflight
      const e = groupsCache.get(key);
      if (e) groupsCache.set(key, { value: e.value, fetchedAt: e.fetchedAt });
      throw err;
    });

  groupsCache.set(key, {
    value: current?.value ?? [],
    fetchedAt: current?.fetchedAt ?? 0,
    inflight,
  });
  return inflight;
}

export type GroupsResult = { groups: EvolutionGroup[]; warming: boolean };

export async function getGroups(
  instance: string,
  includeParticipants: boolean,
): Promise<GroupsResult> {
  const key = cacheKey(instance, includeParticipants);
  let entry = groupsCache.get(key);

  // L1 (memoria) frio -> tenta o L2 (Redis). E isto que deixa o app rapido logo
  // apos um deploy: o container novo perde o cache em memoria, mas o Redis
  // persiste, entao servimos na hora em vez de esperar os ~3min do fetch.
  if (!entry || entry.fetchedAt === 0) {
    const fromRedis = await readRedis(key);
    if (fromRedis) {
      groupsCache.set(key, fromRedis);
      entry = fromRedis;
    }
  }

  // Cold em L1 E L2 (primeirissima carga na vida): NAO bloqueia. Dispara em
  // background e devolve warming=true; a UI mostra "Preparando..." e os grupos
  // aparecem sozinhos. Depois disso o Redis sempre tem — nunca mais espera.
  if (!entry || entry.fetchedAt === 0) {
    void refreshGroups(key, instance, includeParticipants).catch(() => {});
    return { groups: entry?.value ?? [], warming: true };
  }

  // Tem dado -> serve na hora. Se velho, revalida em background (nao bloqueia).
  if (Date.now() - entry.fetchedAt > GROUPS_FRESH_MS && !entry.inflight) {
    void refreshGroups(key, instance, includeParticipants).catch(() => {});
  }
  return { groups: entry.value, warming: false };
}

export function invalidateGroupsCache(instance: string): void {
  for (const k of groupsCache.keys()) {
    if (k.startsWith(`${instance}|`)) groupsCache.delete(k);
  }
  const r = getRedis();
  if (r) {
    void r
      .del(redisKey(`${instance}|0`), redisKey(`${instance}|1`))
      .catch(() => {});
  }
}

// Fork Valcenter: injeta um grupo RECEM-CRIADO no cache (em vez de invalidar tudo).
// Invalidar jogava fora o cache rico (ate ~1500 grupos num numero) e forcava um
// re-fetch LENTO do membership -> o grupo novo (e a maioria) sumia ate reconstruir,
// e se o membership estourasse a lista colapsava pro findChats. Aqui so mesclamos o
// grupo novo na lista que ja existe (L1+L2), dedup por JID, mantendo o fetchedAt.
// Se nao ha cache (frio), nao faz nada: o proximo GET busca a lista completa normal.
export async function addCreatedGroupToCache(
  instance: string,
  group: EvolutionGroup,
): Promise<void> {
  if (!group?.id) return;
  justCreated.set(group.id, Date.now());
  for (const inc of [false, true]) {
    const key = cacheKey(instance, inc);
    let entry = groupsCache.get(key);
    if (!entry || entry.fetchedAt === 0) {
      const fromRedis = await readRedis(key);
      if (fromRedis) entry = fromRedis;
    }
    if (!entry || entry.fetchedAt === 0 || !Array.isArray(entry.value)) continue;
    if (entry.value.some((g) => g.id === group.id)) {
      groupsCache.set(key, entry); // ja presente -> so garante o L1 quente
      continue;
    }
    const merged = [group, ...entry.value];
    groupsCache.set(key, { value: merged, fetchedAt: entry.fetchedAt });
    writeRedis(key, merged, entry.fetchedAt);
  }
}
