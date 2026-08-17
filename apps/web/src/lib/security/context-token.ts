import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

// Verifies the short-lived, signed context token that Chatwoot mints for the
// logged-in agent (GroupManagement::ContextTokenService) and hands to this app
// via the iframe `?ctx=` param. The HS256 signature over the shared secret
// GROUP_CTX_SECRET is what makes the scope trustworthy: the browser cannot forge
// or widen it, so an agent can only ever reach the WhatsApp numbers (inboxes)
// they belong to. Administrators carry `is_admin` and see every number.
//
// HMAC is verified with node:crypto — no extra dependency, and every group route
// already runs on the Node runtime.

export interface GroupScope {
  userId: number;
  isAdmin: boolean;
  inboxIds: number[];
}

const HEADER = "x-cw-ctx";

function b64urlToBuffer(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(
    input.replace(/-/g, "+").replace(/_/g, "/") + pad,
    "base64",
  );
}

function verify(token: string, secret: string): GroupScope | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  if (!header || !payload || !signature) return null;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest();
  const got = b64urlToBuffer(signature);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) {
    return null;
  }

  let claims: {
    user_id?: unknown;
    is_admin?: unknown;
    inbox_ids?: unknown;
    exp?: unknown;
  };
  try {
    claims = JSON.parse(b64urlToBuffer(payload).toString("utf8"));
  } catch {
    return null;
  }

  const exp = typeof claims.exp === "number" ? claims.exp : 0;
  if (!exp || Date.now() / 1000 > exp) return null;

  return {
    userId: Number(claims.user_id) || 0,
    isAdmin: claims.is_admin === true,
    inboxIds: Array.isArray(claims.inbox_ids)
      ? claims.inbox_ids.map((v) => Number(v)).filter((n) => Number.isFinite(n))
      : [],
  };
}

export function readGroupScope(req: NextRequest): GroupScope | null {
  const secret = process.env.GROUP_CTX_SECRET;
  if (!secret) return null;
  const token = req.headers.get(HEADER);
  if (!token) return null;
  return verify(token, secret);
}

// Guard for endpoints that need a valid session but no specific inbox
// (listing inboxes, templates). Returns the scope, or a 401 response.
export function requireGroupScope(
  req: NextRequest,
): { ok: true; scope: GroupScope } | { ok: false; response: NextResponse } {
  const scope = readGroupScope(req);
  if (!scope) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "sessão inválida — recarregue a página" },
        { status: 401 },
      ),
    };
  }
  return { ok: true, scope };
}

// Guard for inbox-scoped endpoints. null when the agent may act on this inbox,
// else a 401/403. Admins pass for any inbox; others only for their own.
export function assertInboxInScope(
  req: NextRequest,
  inboxId: number,
): NextResponse | null {
  const scope = readGroupScope(req);
  if (!scope) {
    return NextResponse.json(
      { error: "sessão inválida — recarregue a página" },
      { status: 401 },
    );
  }
  if (scope.isAdmin) return null;
  if (Number.isFinite(inboxId) && scope.inboxIds.includes(inboxId)) return null;
  return NextResponse.json(
    { error: "sem acesso a esta caixa de entrada" },
    { status: 403 },
  );
}
