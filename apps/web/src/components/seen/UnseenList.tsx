"use client";

import { ChevronRight, Eye, Loader2, RefreshCw } from "lucide-react";
import { useUnseen } from "@/hooks/use-seen";
import { relativeFromEpoch } from "@/lib/utils";

interface UnseenListProps {
  agentId: number | null;
  agentName: string;
}

export function UnseenList({ agentId, agentName }: UnseenListProps) {
  const { data, loading, error, reload } = useUnseen(agentId);

  const openConversation = (id: number) => {
    // Navega o Chatwoot (mesma origem) direto pra conversa.
    try {
      if (window.top) window.top.location.href = `/app/accounts/1/conversations/${id}`;
    } catch {
      // cross-origin bloqueado — ignora
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-4 py-6 sm:px-6">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-medium tracking-tight">Não vistas por mim</h1>
          <p className="text-xs text-muted-foreground">
            Conversas abertas que {agentName || "você"} ainda não viu (ou com
            novidade desde a última vez)
          </p>
        </div>
        <button
          onClick={reload}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          aria-label="Atualizar"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      {!agentId ? (
        <div className="rounded-md border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
          Não consegui identificar o agente. Abra esta tela pela barra lateral do
          Chatwoot.
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <Eye className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Você está em dia! Nada não visto.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <ul className="divide-y divide-border/40 rounded-lg border border-border/60">
            {data.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => openConversation(c.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{c.contact_name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.last_message || "—"}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground/70">
                    {relativeFromEpoch(c.last_activity_at)}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
