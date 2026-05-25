import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { requireConnectedInstance } from "@/lib/chatwoot/instances";
import { createGroup, fetchAllGroups } from "@/lib/evolution/groups";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createBody = z.object({
  inbox_id: z.number().int().positive(),
  subject: z.string().trim().min(1).max(100),
  participants: z.array(z.string().min(8)).min(1).max(256),
  description: z.string().trim().max(512).optional(),
});

export async function GET(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const inboxId = Number(req.nextUrl.searchParams.get("inbox_id") ?? "0");
    const includeParticipants =
      req.nextUrl.searchParams.get("participants") === "true";

    const lookup = await requireConnectedInstance(inboxId);
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }

    const groups = await fetchAllGroups(
      lookup.mapping.instance_name,
      includeParticipants,
    );
    return NextResponse.json({ inbox_id: inboxId, groups });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const input = createBody.parse(await req.json());
    const lookup = await requireConnectedInstance(input.inbox_id);
    if (!lookup.ok) {
      return NextResponse.json({ error: lookup.error }, { status: lookup.status });
    }

    const group = await createGroup({
      instance: lookup.mapping.instance_name,
      subject: input.subject,
      participants: input.participants,
      ...(input.description ? { description: input.description } : {}),
    });
    return NextResponse.json({ inbox_id: input.inbox_id, group }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
