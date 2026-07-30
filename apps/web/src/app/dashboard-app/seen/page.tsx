"use client";

import { Loader2 } from "lucide-react";
import { useChatwootContext } from "@/lib/chatwoot/dashboard-context";
import { SeenPanel } from "@/components/seen/SeenPanel";

export default function DashboardAppSeenPage() {
  const { context, ready } = useChatwootContext();
  const conversationId = context.conversation?.id ?? null;
  const agentId = context.currentAgent?.id ?? null;
  const agentName = context.currentAgent?.name ?? "";

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Conectando ao Chatwoot…
      </div>
    );
  }

  if (!conversationId) {
    return (
      <div className="flex h-screen items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Abra uma conversa pra ver quem já a visualizou.
      </div>
    );
  }

  return (
    <SeenPanel
      conversationId={conversationId}
      agentId={agentId ?? 0}
      agentName={agentName}
    />
  );
}
