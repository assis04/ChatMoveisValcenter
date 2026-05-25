import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { requireConnectedInstance } from "@/lib/chatwoot/instances";
import {
  fetchParticipants,
  updateGroupParticipants,
} from "@/lib/evolution/groups";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  action: z.enum(["add", "remove", "promote", "demote"]),
  participants: z.array(z.string().min(8)).min(1).max(50),
});

type Params = { params: Promise<{ jid: string }> };

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

    const participants = await fetchParticipants(
      lookup.mapping.instance_name,
      jid,
    );
    return NextResponse.json({ inbox_id: inboxId, jid, participants });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const { jid } = await params;
    const inboxId = Number(req.nextUrl.searchParams.get("inbox_id") ?? "0");
    const input = body.parse(await req.json());

    const lookup = await requireConnectedInstance(inboxId);
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }

    const result = await updateGroupParticipants({
      instance: lookup.mapping.instance_name,
      groupJid: jid,
      action: input.action,
      participants: input.participants,
    });
    return NextResponse.json({ inbox_id: inboxId, jid, action: input.action, result });
  } catch (err) {
    return handleApiError(err);
  }
}
