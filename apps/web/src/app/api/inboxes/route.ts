import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import {
  getInstanceMappings,
  invalidateInstanceMappingCache,
} from "@/lib/chatwoot/instances";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lists inboxes that have a corresponding Evolution instance — the only ones
// where group features are available. Used by the wizard's inbox picker.
export async function GET(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    if (req.nextUrl.searchParams.get("refresh") === "true") {
      invalidateInstanceMappingCache();
    }
    const inboxes = await getInstanceMappings();
    return NextResponse.json({ inboxes });
  } catch (err) {
    return handleApiError(err);
  }
}
