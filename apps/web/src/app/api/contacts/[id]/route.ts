import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { chatwootRequest } from "@/lib/chatwoot/client";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCOUNT_ID = Number(process.env.CHATWOOT_ACCOUNT_ID ?? "1");

interface Contact {
  id: number;
  name: string;
  email: string | null;
  phone_number: string | null;
  identifier: string | null;
  thumbnail: string | null;
}

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const { id } = await params;
    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      return NextResponse.json({ error: "id inválido" }, { status: 400 });
    }

    const res = await chatwootRequest<{ payload: Contact }>({
      accountId: ACCOUNT_ID,
      path: `/contacts/${numericId}`,
    });

    return NextResponse.json({ contact: res.payload });
  } catch (err) {
    return handleApiError(err);
  }
}
