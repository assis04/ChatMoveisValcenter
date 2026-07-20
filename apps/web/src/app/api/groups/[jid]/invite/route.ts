import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { requireConnectedInstance } from "@/lib/chatwoot/instances";
import {
  fetchGroupInviteCode,
  revokeGroupInviteCode,
} from "@/lib/evolution/groups";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ jid: string }> };

// GET → link de convite atual. Só admins do grupo conseguem (regra do WhatsApp).
export async function GET(req: NextRequest, { params }: Params) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const { jid } = await params;
    const inboxId = Number(req.nextUrl.searchParams.get("inbox_id") ?? "0");
    const lookup = await requireConnectedInstance(inboxId);
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }
    const invite = await fetchGroupInviteCode(lookup.mapping.instance_name, jid);
    return NextResponse.json({ inbox_id: inboxId, jid, invite });
  } catch (err) {
    return handleApiError(err);
  }
}

// POST → revoga o link atual e devolve um novo (invalida o anterior).
export async function POST(req: NextRequest, { params }: Params) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const { jid } = await params;
    const inboxId = Number(req.nextUrl.searchParams.get("inbox_id") ?? "0");
    const lookup = await requireConnectedInstance(inboxId);
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }
    const invite = await revokeGroupInviteCode(lookup.mapping.instance_name, jid);
    return NextResponse.json({ inbox_id: inboxId, jid, invite });
  } catch (err) {
    return handleApiError(err);
  }
}
