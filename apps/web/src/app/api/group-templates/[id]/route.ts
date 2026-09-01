import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { requireGroupScope } from "@/lib/security/context-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api/errors";
import { templateBody } from "@/lib/templates/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchBody = templateBody.partial();

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  const guard = requireGroupScope(req);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const input = patchBody.parse(await req.json());
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("group_templates")
      .update(input)
      .eq("id", id)
      .eq("account_id", guard.scope.accountId)
      .select("*")
      .single();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return NextResponse.json({ template: data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  const guard = requireGroupScope(req);
  if (!guard.ok) return guard.response;

  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("group_templates")
      .delete()
      .eq("id", id)
      .eq("account_id", guard.scope.accountId);
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
