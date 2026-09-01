import { chatwootRequest } from "./client";
import { evolutionRequest } from "@/lib/evolution/client";
import type { InboxInstanceMapping } from "@/types";

const CACHE_TTL_MS = 60_000;

interface ChatwootInbox {
  id: number;
  name: string;
  channel_type: string;
}

interface EvolutionInstance {
  id: string;
  name: string;
  connectionStatus: string;
  Chatwoot?: {
    enabled: boolean;
    accountId: string;
    nameInbox: string | null;
  } | null;
}

// Cache keyed by account — one company's mappings must never be served to
// another. Evolution instances are global, so we always re-scope per account.
const cacheByAccount = new Map<
  number,
  { value: InboxInstanceMapping[]; expiresAt: number }
>();

export function invalidateInstanceMappingCache(accountId?: number): void {
  if (accountId === undefined) cacheByAccount.clear();
  else cacheByAccount.delete(accountId);
}

async function fetchInboxes(accountId: number): Promise<ChatwootInbox[]> {
  const res = await chatwootRequest<{ payload: ChatwootInbox[] }>({
    accountId,
    path: "/inboxes",
  });
  return res.payload;
}

async function fetchInstances(): Promise<EvolutionInstance[]> {
  return evolutionRequest<EvolutionInstance[]>({
    path: "/instance/fetchInstances",
  });
}

export async function getInstanceMappings(
  accountId: number,
): Promise<InboxInstanceMapping[]> {
  const cached = cacheByAccount.get(accountId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [inboxes, instances] = await Promise.all([
    fetchInboxes(accountId),
    fetchInstances(),
  ]);

  const inboxByName = new Map(inboxes.map((i) => [i.name, i]));
  const mappings: InboxInstanceMapping[] = [];

  for (const instance of instances) {
    // Double scope: the instance must declare THIS account, and its linked inbox
    // must exist among THIS account's inboxes. Either check alone already
    // isolates; together they leave no room for cross-account bleed.
    if (instance.Chatwoot?.enabled !== true) continue;
    if (instance.Chatwoot?.accountId !== String(accountId)) continue;

    const linkedInboxName = instance.Chatwoot?.nameInbox;
    if (!linkedInboxName) continue;

    const inbox = inboxByName.get(linkedInboxName);
    if (!inbox) continue;

    mappings.push({
      inbox_id: inbox.id,
      inbox_name: inbox.name,
      instance_name: instance.name,
      instance_id: instance.id,
      connection_status: instance.connectionStatus,
    });
  }

  cacheByAccount.set(accountId, {
    value: mappings,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return mappings;
}

export async function resolveInstanceForInbox(
  accountId: number,
  inboxId: number,
): Promise<InboxInstanceMapping | null> {
  const mappings = await getInstanceMappings(accountId);
  return mappings.find((m) => m.inbox_id === inboxId) ?? null;
}

export type InstanceLookup =
  | { ok: true; mapping: InboxInstanceMapping }
  | { ok: false; status: 400 | 404 | 409; error: string };

export async function requireConnectedInstance(
  accountId: number,
  inboxId: number,
): Promise<InstanceLookup> {
  if (!Number.isFinite(inboxId) || inboxId <= 0) {
    return { ok: false, status: 400, error: "inbox_id inválido" };
  }
  const mapping = await resolveInstanceForInbox(accountId, inboxId);
  if (!mapping) {
    return {
      ok: false,
      status: 404,
      error: `nenhuma instância Evolution mapeada para inbox ${inboxId}`,
    };
  }
  if (mapping.connection_status !== "open") {
    return {
      ok: false,
      status: 409,
      error: `instância "${mapping.instance_name}" desconectada (status: ${mapping.connection_status})`,
    };
  }
  return { ok: true, mapping };
}
