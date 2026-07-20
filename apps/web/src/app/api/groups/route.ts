import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { requireConnectedInstance } from "@/lib/chatwoot/instances";
import { createGroup, fetchAllGroups } from "@/lib/evolution/groups";
import { handleApiError } from "@/lib/api/errors";
import { getRedis } from "@/lib/redis";
import type { EvolutionGroup } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Evolution fetchAllGroups consulta metadata por grupo via Baileys e pode
// levar 60–120s em inboxes com centenas de grupos. Memoizamos por
// (instance, includeParticipants) com TTL curto pra absorver re-listagens
// frequentes da UI (foco do tab, abrir modal, etc.).
// Stale-while-revalidate: servimos o cache na hora (mesmo levemente velho) e
// revalidamos em BACKGROUND (fire-and-forget), pra o usuario nunca esperar os
// 125s+ do fetchAllGroups. So a primeirissima carga (sem cache) bloqueia — e o
// cron de warm-up pre-popula pra evitar ate isso.
const GROUPS_FRESH_MS = 30 * 60_000; // apos isso, revalida em background
type CacheKey = string;
type CacheEntry = {
  value: EvolutionGroup[];
  fetchedAt: number; // 0 = nunca teve fetch bem-sucedido
  inflight?: Promise<EvolutionGroup[]>;
};
const groupsCache = new Map<CacheKey, CacheEntry>();

function cacheKey(instance: string, includeParticipants: boolean): CacheKey {
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

function refreshGroups(
  key: CacheKey,
  instance: string,
  includeParticipants: boolean,
): Promise<EvolutionGroup[]> {
  const current = groupsCache.get(key);
  if (current?.inflight) return current.inflight;

  const inflight = fetchAllGroups(instance, includeParticipants)
    .then((value) => {
      const fetchedAt = Date.now();
      groupsCache.set(key, { value, fetchedAt });
      writeRedis(key, value, fetchedAt); // persiste no L2 pra sobreviver a deploys
      return value;
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

type GroupsResult = { groups: EvolutionGroup[]; warming: boolean };

async function getGroups(
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

function invalidateGroupsCache(instance: string): void {
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

const createBody = z.object({
  inbox_id: z.number().int().positive(),
  subject: z.string().trim().min(1).max(100),
  participants: z.array(z.string().min(8)).min(1).max(256),
  description: z.string().trim().max(512).optional(),
});

export async function GET(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const inboxId = Number(req.nextUrl.searchParams.get("inbox_id") ?? "0");
    const includeParticipants =
      req.nextUrl.searchParams.get("participants") === "true";

    const lookup = await requireConnectedInstance(inboxId);
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }

    const force = req.nextUrl.searchParams.get("refresh") === "true";
    if (force) invalidateGroupsCache(lookup.mapping.instance_name);

    const { groups, warming } = await getGroups(
      lookup.mapping.instance_name,
      includeParticipants,
    );
    return NextResponse.json({ inbox_id: inboxId, groups, warming });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const input = createBody.parse(await req.json());
    const lookup = await requireConnectedInstance(input.inbox_id);
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }

    const group = await createGroup({
      instance: lookup.mapping.instance_name,
      subject: input.subject,
      participants: input.participants,
      ...(input.description ? { description: input.description } : {}),
    });
    invalidateGroupsCache(lookup.mapping.instance_name);
    return NextResponse.json({ inbox_id: input.inbox_id, group }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
