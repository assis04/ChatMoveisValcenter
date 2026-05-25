import { chatwootRequest } from "./client";
import { evolutionRequest } from "@/lib/evolution/client";
import type { InboxInstanceMapping } from "@/types";

const ACCOUNT_ID = Number(process.env.CHATWOOT_ACCOUNT_ID ?? "1");
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

let cache: { value: InboxInstanceMapping[]; expiresAt: number } | null = null;

export function invalidateInstanceMappingCache(): void {
  cache = null;
}

async function fetchInboxes(): Promise<ChatwootInbox[]> {
  const res = await chatwootRequest<{ payload: ChatwootInbox[] }>({
    accountId: ACCOUNT_ID,
    path: "/inboxes",
  });
  return res.payload;
}

async function fetchInstances(): Promise<EvolutionInstance[]> {
  return evolutionRequest<EvolutionInstance[]>({
    path: "/instance/fetchInstances",
  });
}

export async function getInstanceMappings(): Promise<InboxInstanceMapping[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const [inboxes, instances] = await Promise.all([
    fetchInboxes(),
    fetchInstances(),
  ]);

  const inboxByName = new Map(inboxes.map((i) => [i.name, i]));
  const mappings: InboxInstanceMapping[] = [];

  for (const instance of instances) {
    const linkedInboxName = instance.Chatwoot?.nameInbox;
    if (!linkedInboxName || instance.Chatwoot?.enabled !== true) continue;

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

  cache = { value: mappings, expiresAt: Date.now() + CACHE_TTL_MS };
  return mappings;
}

export async function resolveInstanceForInbox(
  inboxId: number,
): Promise<InboxInstanceMapping | null> {
  const mappings = await getInstanceMappings();
  return mappings.find((m) => m.inbox_id === inboxId) ?? null;
}

export type InstanceLookup =
  | { ok: true; mapping: InboxInstanceMapping }
  | { ok: false; status: 400 | 404 | 409; error: string };

export async function requireConnectedInstance(
  inboxId: number,
): Promise<InstanceLookup> {
  if (!Number.isFinite(inboxId) || inboxId <= 0) {
    return { ok: false, status: 400, error: "inbox_id inválido" };
  }
  const mapping = await resolveInstanceForInbox(inboxId);
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
