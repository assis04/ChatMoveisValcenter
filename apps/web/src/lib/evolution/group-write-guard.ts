import { getRedis } from "@/lib/redis";

// Guarda de escrita em grupo (Fork Valcenter).
// POR QUE: operacao de ESCRITA em grupo via Baileys (add/remove participante,
// criar grupo, mudar assunto/foto, sair) e o gatilho #1 do antifraude do
// WhatsApp. Foi o que derrubou o numero de Guarulhos repetidas vezes com
// "stream:error 401 -> conflict {type: device_removed}" ate ele virar um numero
// flagrado. Rajada de writes = flag. Entao espacamos e limitamos por INSTANCIA
// (o numero), nao por usuario: o risco e do numero, nao de quem clicou.
//
// O slot e consumido NA TENTATIVA (antes do write), de proposito: se fosse so
// no sucesso, uma tempestade de retry em cima de erro furaria o espacamento —
// que e exatamente o cenario de flood que derrubou os numeros antes.
//
// Best-effort: Redis fora => libera (fail-open). Isto e protecao, nao
// autorizacao; nunca deve impedir o trabalho por causa de cache indisponivel.

const MIN_INTERVAL_S = Number(process.env.GROUP_WRITE_MIN_INTERVAL_S ?? 15);
const HOURLY_CAP = Number(process.env.GROUP_WRITE_HOURLY_CAP ?? 30);

export type ThrottleReason = "interval" | "hourly";

export class GroupWriteThrottled extends Error {
  readonly retryAfter: number;
  readonly reason: ThrottleReason;
  constructor(retryAfter: number, reason: ThrottleReason) {
    super(
      reason === "interval"
        ? "Aguarde " + retryAfter + "s antes da proxima alteracao de grupo neste numero (protecao da conexao)."
        : "Limite de " + HOURLY_CAP + " alteracoes de grupo por hora neste numero atingido. Tente novamente em " + Math.ceil(retryAfter / 60) + " min (protecao da conexao).",
    );
    this.name = "GroupWriteThrottled";
    this.retryAfter = retryAfter;
    this.reason = reason;
  }
}

const lastKey = (instance: string) => "cmv:gw:last:" + instance;
const hourKey = (instance: string) => "cmv:gw:hour:" + instance;

/**
 * Libera o write ou lanca GroupWriteThrottled (que o handleApiError traduz em
 * 429 + Retry-After). Chamar ANTES de qualquer escrita de grupo na Evolution.
 */
export async function assertGroupWriteAllowed(instance: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return; // fail-open
  let denied: GroupWriteThrottled | null = null;
  try {
    const now = Date.now();
    const [lastRaw, hourRaw] = await redis.mget(lastKey(instance), hourKey(instance));
    if (lastRaw) {
      const elapsed = (now - Number(lastRaw)) / 1000;
      if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_INTERVAL_S) {
        denied = new GroupWriteThrottled(Math.max(1, Math.ceil(MIN_INTERVAL_S - elapsed)), "interval");
      }
    }
    if (!denied && Number(hourRaw ?? 0) >= HOURLY_CAP) {
      const ttl = await redis.ttl(hourKey(instance));
      denied = new GroupWriteThrottled(ttl > 0 ? ttl : 3600, "hourly");
    }
    if (!denied) {
      await redis.set(lastKey(instance), String(now), "EX", 3600);
      const n = await redis.incr(hourKey(instance));
      if (n === 1) await redis.expire(hourKey(instance), 3600);
    }
  } catch {
    return; // falha de Redis -> fail-open
  }
  if (denied) throw denied;
}
