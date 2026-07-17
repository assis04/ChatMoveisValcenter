const EVOLUTION_URL =
  process.env.EVOLUTION_URL ?? "http://evolution:8080";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY ?? "";

interface EvolutionRequestOptions {
  method?: string;
  path: string;
  body?: Record<string, unknown>;
  timeoutMs?: number;
}

export async function evolutionRequest<T>({
  method = "GET",
  path,
  body,
  timeoutMs,
}: EvolutionRequestOptions): Promise<T> {
  const url = `${EVOLUTION_URL}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: EVOLUTION_API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Evolution API error ${response.status}: ${error}`);
  }

  return response.json() as Promise<T>;
}
