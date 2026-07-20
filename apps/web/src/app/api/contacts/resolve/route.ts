import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { chatwootRequest } from "@/lib/chatwoot/client";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Resolve WhatsApp participant phone numbers -> Chatwoot contact name/avatar,
// so the members panel shows "João Silva" instead of "+55 11 9xxxx-xxxx".
// Chatwoot has no batch-by-phone lookup, so we search per unique phone with a
// small concurrency cap and memoize each result (contacts rarely change).
const ACCOUNT_ID = Number(process.env.CHATWOOT_ACCOUNT_ID ?? "1");
const CACHE_TTL_MS = 5 * 60_000;
const MAX_PHONES = 256;
const CONCURRENCY = 8;

interface ResolvedContact {
  name: string;
  thumbnail: string | null;
}

interface ChatwootContact {
  id: number;
  name: string;
  phone_number: string | null;
  identifier: string | null;
  thumbnail: string | null;
}

const cache = new Map<string, { value: ResolvedContact | null; expiresAt: number }>();

function digitsOf(raw: string): string {
  return raw.replace(/\D/g, "");
}

async function resolveOne(digits: string): Promise<ResolvedContact | null> {
  if (!digits) return null;
  const hit = cache.get(digits);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  let value: ResolvedContact | null = null;
  try {
    const res = await chatwootRequest<{ payload: ChatwootContact[] }>({
      accountId: ACCOUNT_ID,
      path: `/contacts/search?q=${encodeURIComponent(digits)}&page=1`,
    });
    // Match tolerating BR's optional 9th mobile digit / country-code variance:
    // exact digits, else same last 8 (subscriber number).
    const last8 = digits.slice(-8);
    const match = res.payload.find((c) => {
      const d = digitsOf(c.phone_number ?? "");
      return d.length >= 8 && (d === digits || d.slice(-8) === last8);
    });
    if (match) value = { name: match.name, thumbnail: match.thumbnail };
  } catch {
    // On upstream failure, cache a miss briefly so we don't hammer Chatwoot;
    // the panel just falls back to the formatted number.
    value = null;
  }
  cache.set(digits, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

const body = z.object({
  phones: z.array(z.string()).min(1).max(MAX_PHONES),
});

export async function POST(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const { phones } = body.parse(await req.json());
    const unique = Array.from(new Set(phones.map(digitsOf).filter(Boolean)));

    const resolved: Record<string, ResolvedContact> = {};
    for (let i = 0; i < unique.length; i += CONCURRENCY) {
      const chunk = unique.slice(i, i + CONCURRENCY);
      const results = await Promise.all(chunk.map(resolveOne));
      chunk.forEach((digits, idx) => {
        const r = results[idx];
        if (r) resolved[digits] = r;
      });
    }

    return NextResponse.json({ resolved });
  } catch (err) {
    return handleApiError(err);
  }
}
