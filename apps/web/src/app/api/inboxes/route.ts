import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { requireGroupScope } from "@/lib/security/context-token";
import {
  getInstanceMappings,
  invalidateInstanceMappingCache,
} from "@/lib/chatwoot/instances";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lists inboxes that have a corresponding Evolution instance — the only ones
// where group features are available. Scoped to the caller: an admin sees every
// number, an agent only the inboxes they belong to.
export async function GET(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  const guard = requireGroupScope(req);
  if (!guard.ok) return guard.response;

  try {
    if (req.nextUrl.searchParams.get("refresh") === "true") {
      invalidateInstanceMappingCache();
    }
    const all = await getInstanceMappings();
    const inboxes = guard.scope.isAdmin
      ? all
      : all.filter((m) => guard.scope.inboxIds.includes(m.inbox_id));
    return NextResponse.json({ inboxes });
  } catch (err) {
    return handleApiError(err);
  }
}
