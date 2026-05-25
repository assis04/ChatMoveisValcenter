import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { chatwootRequest } from "@/lib/chatwoot/client";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCOUNT_ID = Number(process.env.CHATWOOT_ACCOUNT_ID ?? "1");

interface ChatwootContact {
  id: number;
  name: string;
  email: string | null;
  phone_number: string | null;
  identifier: string | null;
  thumbnail: string | null;
}

interface ChatwootSearchResponse {
  payload: ChatwootContact[];
  meta: { count: number; current_page: number };
}

// Proxies Chatwoot contact search so the iframe doesn't need to expose the
// platform API token. We filter out group "contacts" (identifier @g.us) since
// they cannot be added as participants of another group.
export async function GET(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    if (q.length < 2) {
      return NextResponse.json({ contacts: [] });
    }

    const res = await chatwootRequest<ChatwootSearchResponse>({
      accountId: ACCOUNT_ID,
      path: `/contacts/search?q=${encodeURIComponent(q)}&page=1`,
    });

    const contacts = res.payload
      .filter((c) => !c.identifier?.endsWith("@g.us"))
      .filter((c) => c.phone_number && c.phone_number.length > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        phone_number: c.phone_number,
        thumbnail: c.thumbnail,
      }));

    return NextResponse.json({ contacts });
  } catch (err) {
    return handleApiError(err);
  }
}
