// Client-side fetch wrapper aware of Next.js basePath ("/ext"). Server routes
// declared at app/api/* are exposed externally at /ext/api/*; the browser must
// include the prefix explicitly since fetch URLs are not rewritten.

const BASE = "/ext";

// Chatwoot hands the iframe a short-lived, signed scope token via `?ctx=`. We
// capture it once and attach it to every request as `x-cw-ctx`, so the server
// enforces which WhatsApp numbers this agent may see. Stored in sessionStorage
// so it survives client-side navigations within the app.
const CTX_HEADER = "x-cw-ctx";
const CTX_STORAGE_KEY = "cw_group_ctx";

function ctxToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("ctx");
    if (fromUrl) {
      window.sessionStorage.setItem(CTX_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return window.sessionStorage.getItem(CTX_STORAGE_KEY);
  } catch {
    return null;
  }
}

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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const ctx = ctxToken();
  if (ctx) headers[CTX_HEADER] = ctx;

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers,
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
