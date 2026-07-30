"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { UnseenList } from "@/components/seen/UnseenList";
import { useChatwootContext } from "@/lib/chatwoot/dashboard-context";

function UnseenInner() {
  const params = useSearchParams();
  const { context } = useChatwootContext();

  // O agente vem pela URL (a barra lateral do Chatwoot injeta) ou, se disponível,
  // pelo contexto do Dashboard App.
  const agentId =
    Number(params.get("agent_id") ?? "") || context.currentAgent?.id || null;
  const agentName =
    params.get("agent_name") ?? context.currentAgent?.name ?? "";

  return (
    <div className="h-screen">
      <UnseenList agentId={agentId} agentName={agentName} />
    </div>
  );
}

export default function DashboardAppUnseenPage() {
  return (
    <Suspense fallback={null}>
      <UnseenInner />
    </Suspense>
  );
}
