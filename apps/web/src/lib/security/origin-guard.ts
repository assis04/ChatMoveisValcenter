import { NextRequest, NextResponse } from "next/server";

// Group APIs are reachable only from within an authenticated Chatwoot session
// running our Dashboard App iframe. Authentication is delegated to Chatwoot's
// session (only logged-in agents see the iframe); we enforce same-origin here.
//
// Origin is preferred over Referer because it is always present on cross-origin
// requests for non-GET methods, while Referer can be stripped by browsers.

// Default matches the only production deployment today. Override via env
// when adding new tenants or testing against a staging Chatwoot.
const PUBLIC_URL =
  process.env.CHATWOOT_PUBLIC_URL ?? "https://chat.moveisvalcenter.com.br";
const DEV_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
]);

function allowedOrigins(): Set<string> {
  const set = new Set<string>();
  if (PUBLIC_URL) {
    try {
      set.add(new URL(PUBLIC_URL).origin);
    } catch {
      // ignore malformed env
    }
  }
  if (process.env.NODE_ENV !== "production") {
    for (const o of DEV_ORIGINS) set.add(o);
  }
  return set;
}

export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const allowed = allowedOrigins();
  if (allowed.size === 0) {
    return NextResponse.json(
      { error: "CHATWOOT_PUBLIC_URL not configured" },
      { status: 500 },
    );
  }

  const origin = req.headers.get("origin");
  if (origin && allowed.has(origin)) return null;

  if (!origin) {
    const referer = req.headers.get("referer");
    if (referer) {
      try {
        const refOrigin = new URL(referer).origin;
        if (allowed.has(refOrigin)) return null;
      } catch {
        // fallthrough
      }
    }
  }

  return NextResponse.json({ error: "forbidden origin" }, { status: 403 });
}
