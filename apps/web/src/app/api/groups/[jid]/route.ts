import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { requireConnectedInstance } from "@/lib/chatwoot/instances";
import {
  findGroupInfos,
  leaveGroup,
  updateGroupDescription,
  updateGroupPicture,
  updateGroupSubject,
} from "@/lib/evolution/groups";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchBody = z
  .object({
    subject: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(512).optional(),
    // Picture must be a URL — agents upload to object storage first, then
    // pass the URL here. Base64 inline would blow the 1MB default body limit.
    picture: z.string().url().max(2048).optional(),
  })
  .refine(
    (v) => v.subject || v.description !== undefined || v.picture,
    "informe ao menos um campo: subject, description ou picture",
  );

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

    const group = await findGroupInfos(lookup.mapping.instance_name, jid);
    return NextResponse.json({ inbox_id: inboxId, group });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const { jid } = await params;
    const inboxId = Number(req.nextUrl.searchParams.get("inbox_id") ?? "0");
    const input = patchBody.parse(await req.json());

    const lookup = await requireConnectedInstance(inboxId);
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }
    const instance = lookup.mapping.instance_name;

    if (input.subject) await updateGroupSubject(instance, jid, input.subject);
    if (input.description !== undefined)
      await updateGroupDescription(instance, jid, input.description);
    if (input.picture) await updateGroupPicture(instance, jid, input.picture);

    return NextResponse.json({ inbox_id: inboxId, jid, ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const { jid } = await params;
    const inboxId = Number(req.nextUrl.searchParams.get("inbox_id") ?? "0");
    const lookup = await requireConnectedInstance(inboxId);
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }

    await leaveGroup(lookup.mapping.instance_name, jid);
    return NextResponse.json({ inbox_id: inboxId, jid, ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
