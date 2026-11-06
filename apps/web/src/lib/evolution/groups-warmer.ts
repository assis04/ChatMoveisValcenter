import { evolutionRequest } from "@/lib/evolution/client";
import { cacheKey, refreshGroups } from "@/lib/evolution/groups-cache";
import { getInstanceMappings } from "@/lib/chatwoot/instances";
import { syncNewGroupContacts } from "@/lib/chatwoot/group-contacts";

// Auto-aquecedor do cache de grupos. Ligado uma vez no boot do server pelo
// instrumentation.ts. Objetivo: manter o Redis (L2, TTL 24h) SEMPRE quente e
// fresco, matando o "cache frio" — o unico caso em que a lista de grupos ainda
// demorava (ninguem abria por um tempo -> Redis expirava -> a proxima abertura
// pagava os ~125s do fetchAllGroups). Substitui o antigo cron de warm-up (que
// nunca chegou a existir) por algo IN-PROCESS: sem secret novo, sem cron pra
// esquecer num reset da VPS, e reusando o MESMO cache/fetch da rota.
//
// Fork Valcenter (2026-11): no mesmo ciclo, cadastra no Chatwoot o contato dos
// grupos novos que ainda nao passaram por la (ver group-contacts.ts).

interface EvolutionInstanceLite {
  name?: string;
  connectionStatus?: string;
  Chatwoot?: { enabled?: boolean; accountId?: string | null } | null;
}

const WARM_INTERVAL_MS = 20 * 60_000; // < 30min (fresh) e << 24h (TTL do Redis)
const FIRST_RUN_DELAY_MS = 30_000; // deixa Chatwoot/Evolution subirem antes do 1o ciclo
let started = false;

async function connectedInstances(): Promise<{ name: string; accountId: number }[]> {
  try {
    const list = await evolutionRequest<EvolutionInstanceLite[]>({
      path: "/instance/fetchInstances",
    });
    return (Array.isArray(list) ? list : [])
      .filter((i) => i?.Chatwoot?.enabled === true && i.connectionStatus === "open")
      .map((i) => ({ name: i.name ?? "", accountId: Number(i.Chatwoot?.accountId) || 0 }))
      .filter((i) => i.name.length > 0);
  } catch {
    return [];
  }
}

async function syncContacts(name: string, accountId: number): Promise<void> {
  if (accountId <= 0) return;
  const mapping = (await getInstanceMappings(accountId)).find((m) => m.instance_name === name);
  if (mapping) await syncNewGroupContacts(name, accountId, mapping.inbox_id);
}

async function warmOnce(): Promise<void> {
  const instances = await connectedInstances();
  // Sequencial de proposito: uma instancia de cada vez e gentil com a Evolution e
  // com o Chatwoot; o custo de tempo (background) e irrelevante.
  for (const { name, accountId } of instances) {
    try {
      // includeParticipants=false: e a chave que a LISTA de grupos consome.
      await refreshGroups(cacheKey(name, false), name, false);
    } catch {
      // best-effort: uma instancia lenta/caida nao trava as outras
    }
    try {
      await syncContacts(name, accountId);
    } catch (err) {
      console.warn(`[groups-sync] ${name}: ${String((err as Error)?.message ?? err).slice(0, 160)}`);
    }
  }
}

export function startGroupsWarmer(): void {
  if (started) return; // idempotente: register() pode ser chamado mais de uma vez
  started = true;
  setTimeout(() => {
    void warmOnce();
    setInterval(() => void warmOnce(), WARM_INTERVAL_MS);
  }, FIRST_RUN_DELAY_MS);
}
