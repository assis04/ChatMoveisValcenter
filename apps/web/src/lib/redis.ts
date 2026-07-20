import Redis from "ioredis";

// Redis é usado como camada de cache PERSISTENTE (L2) — sobrevive a deploys/
// restarts do app, ao contrário do cache em memória. É best-effort: se o Redis
// estiver indisponível, tudo cai graciosamente pro fetch ao vivo. NUNCA deve
// derrubar uma request.
//
// Default aponta pro serviço `redis` da mesma rede Docker, db 5 (evolution usa
// db 1, chatwoot usa db 0) — sem precisar de env nova. Override via REDIS_URL.

let client: Redis | null = null;
let disabled = false;

export function getRedis(): Redis | null {
  if (disabled) return null;
  if (client) return client;
  try {
    client = new Redis(process.env.REDIS_URL ?? "redis://redis:6379/5", {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 300, 2000)),
    });
    // Swallow errors — Redis é opcional. Sem isso, um erro de conexão viraria
    // um "unhandled error event" e derrubaria o processo.
    client.on("error", () => {});
    return client;
  } catch {
    disabled = true;
    return null;
  }
}
