import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin } from "@/lib/security/origin-guard";
import { requireGroupScope } from "@/lib/security/context-token";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchOpenConversations } from "@/lib/chatwoot/conversations";
import { handleApiError } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?agent_id=X → conversas abertas que ESTE agente ainda não viu (ou que
// tiveram atividade depois do último "visto" dele). É a lista "não vistas
// por mim" — cruza as conversas do Chatwoot com a tabela conversation_seen.
export async function GET(req: NextRequest) {
  const denied = assertSameOrigin(req);
  if (denied) return denied;

  const guard = requireGroupScope(req);
  if (!guard.ok) return guard.response;
  const accountId = guard.scope.accountId;

  try {
    const agentId = Number(req.nextUrl.searchParams.get("agent_id") ?? "0");
    if (!agentId) {
      return NextResponse.json({ error: "agent_id inválido" }, { status: 400 });
    }

    const [conversations, seenRows] = await Promise.all([
      fetchOpenConversations(accountId),
      (async () => {
        const supabase = createAdminClient();
        const { data, error } = await supabase
          .from("conversation_seen")
          .select("conversation_id, last_seen_at")
          .eq("account_id", accountId)
          .eq("agent_id", agentId);
        if (error) throw new Error(`Supabase error: ${error.message}`);
        return data ?? [];
      })(),
    ]);

    const seenAt = new Map<number, number>();
    for (const r of seenRows) {
      seenAt.set(
        r.conversation_id,
        Math.floor(new Date(r.last_seen_at).getTime() / 1000),
      );
    }

    const unseen = conversations
      .filter((c) => {
        const s = seenAt.get(c.id);
        return s === undefined || c.last_activity_at > s;
      })
      .sort((a, b) => b.last_activity_at - a.last_activity_at);

    return NextResponse.json({ unseen });
  } catch (err) {
    return handleApiError(err);
  }
}
