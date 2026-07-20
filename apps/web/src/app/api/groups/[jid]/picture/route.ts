import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { requireConnectedInstance } from "@/lib/chatwoot/instances";
import { updateGroupPicture } from "@/lib/evolution/groups";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Upload da foto do grupo. O cliente redimensiona pra ~512px antes de enviar,
// então o base64 fica pequeno (~dezenas de KB). Aceitamos data URL ou base64
// cru; o Evolution (POST /group/updateGroupPicture) espera base64 cru.
const body = z.object({
  image: z.string().min(16).max(3_000_000),
});

type Params = { params: Promise<{ jid: string }> };

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

    const image = input.image.replace(
      /^data:image\/[a-zA-Z0-9.+-]+;base64,/,
      "",
    );
    await updateGroupPicture(lookup.mapping.instance_name, jid, image);
    return NextResponse.json({ inbox_id: inboxId, jid, ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
