import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCOUNT_ID = Number(process.env.CHATWOOT_ACCOUNT_ID ?? "1");

const recordBody = z.object({
  conversation_id: z.number().int().positive(),
  agent_id: z.number().int().positive(),
  agent_name: z.string().trim().max(160).default(""),
});

// POST → registra que o agente viu esta conversa AGORA (upsert por agente).
export async function POST(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const input = recordBody.parse(await req.json());
    const supabase = createAdminClient();
    const { error } = await supabase.from("conversation_seen").upsert(
      {
        account_id: ACCOUNT_ID,
        conversation_id: input.conversation_id,
        agent_id: input.agent_id,
        agent_name: input.agent_name,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "account_id,conversation_id,agent_id" },
    );
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

// GET ?conversation_id=X → quem já viu esta conversa (pro painel "visto por").
export async function GET(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  try {
    const conversationId = Number(
      req.nextUrl.searchParams.get("conversation_id") ?? "0",
    );
    if (!conversationId) return NextResponse.json({ seen: [] });

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("conversation_seen")
      .select("agent_id, agent_name, last_seen_at")
      .eq("account_id", ACCOUNT_ID)
      .eq("conversation_id", conversationId)
      .order("last_seen_at", { ascending: false });
    if (error) throw new Error(`Supabase error: ${error.message}`);
    return NextResponse.json({ seen: data ?? [] });
  } catch (err) {
    return handleApiError(err);
  }
}
