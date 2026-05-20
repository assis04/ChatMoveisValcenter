const CHATWOOT_URL = process.env.CHATWOOT_URL ?? "http://chatwoot-web:3000";
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN ?? "";

interface ChatwootRequestOptions {
  method?: string;
  path: string;
  body?: Record<string, unknown>;
  accountId: number;
}

export async function chatwootRequest<T>({
  method = "GET",
  path,
  body,
  accountId,
}: ChatwootRequestOptions): Promise<T> {
  const url = `${CHATWOOT_URL}/api/v1/accounts/${accountId}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      api_access_token: CHATWOOT_API_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Chatwoot API error ${response.status}: ${error}`);
  }

  return response.json() as Promise<T>;
}
