// Client-side fetch wrapper aware of Next.js basePath ("/ext"). Server routes
// declared at app/api/* are exposed externally at /ext/api/*; the browser must
// include the prefix explicitly since fetch URLs are not rewritten.

const BASE = "/ext";

export interface ApiOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  status: number;
  payload: unknown;
  constructor(status: number, payload: unknown, message: string) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
  };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  if (options.signal) init.signal = options.signal;

  const res = await fetch(`${BASE}${path}`, init);
  const ct = res.headers.get("content-type") ?? "";
  const payload: unknown = ct.includes("application/json")
    ? await res.json()
    : await res.text();

  if (!res.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `request failed with status ${res.status}`;
    throw new ApiError(res.status, payload, message);
  }
  return payload as T;
}
