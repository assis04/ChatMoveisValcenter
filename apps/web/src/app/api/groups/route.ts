import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { requireConnectedInstance } from "@/lib/chatwoot/instances";
import { createGroup, fetchAllGroups } from "@/lib/evolution/groups";
import { handleApiError } from "@/lib/api/errors";
import type { EvolutionGroup } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Evolution fetchAllGroups consulta metadata por grupo via Baileys e pode
// levar 60–120s em inboxes com centenas de grupos. Memoizamos por
// (instance, includeParticipants) com TTL curto pra absorver re-listagens
// frequentes da UI (foco do tab, abrir modal, etc.).
const GROUPS_TTL_MS = 5 * 60_000;
type CacheKey = string;
const groupsCache = new Map<
  CacheKey,
  { value: EvolutionGroup[]; expiresAt: number; inflight?: Promise<EvolutionGroup[]> }
>();

function cacheKey(instance: string, includeParticipants: boolean): CacheKey {
  return `${instance}|${includeParticipants ? 1 : 0}`;
}

async function cachedFetchAllGroups(
  instance: string,
  includeParticipants: boolean,
): Promise<EvolutionGroup[]> {
  const key = cacheKey(instance, includeParticipants);
  const now = Date.now();
  const entry = groupsCache.get(key);

  if (entry && entry.expiresAt > now) return entry.value;
  if (entry?.inflight) return entry.inflight;

  const inflight = fetchAllGroups(instance, includeParticipants)
    .then((value) => {
      groupsCache.set(key, { value, expiresAt: Date.now() + GROUPS_TTL_MS });
      return value;
    })
    .catch((err) => {
      groupsCache.delete(key);
      throw err;
    });

  groupsCache.set(key, {
    value: entry?.value ?? [],
    expiresAt: 0,
    inflight,
  });

  return inflight;
}

function invalidateGroupsCache(instance: string): void {
  for (const k of groupsCache.keys()) {
    if (k.startsWith(`${instance}|`)) groupsCache.delete(k);
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

    const groups = await cachedFetchAllGroups(
      lookup.mapping.instance_name,
      includeParticipants,
    );
    return NextResponse.json({ inbox_id: inboxId, groups });
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
