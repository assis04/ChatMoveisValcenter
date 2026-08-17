import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { requireGroupScope } from "@/lib/security/context-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api/errors";
import { templateBody } from "@/lib/templates/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCOUNT_ID = Number(process.env.CHATWOOT_ACCOUNT_ID ?? "1");

export async function GET(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  const guard = requireGroupScope(req);
  if (!guard.ok) return guard.response;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("group_templates")
      .select("*")
      .eq("account_id", ACCOUNT_ID)
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return NextResponse.json({ templates: data ?? [] });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  const guard = requireGroupScope(req);
  if (!guard.ok) return guard.response;

  try {
    const input = templateBody.parse(await req.json());
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("group_templates")
      .insert({ ...input, account_id: ACCOUNT_ID })
      .select("*")
      .single();
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return NextResponse.json({ template: data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
