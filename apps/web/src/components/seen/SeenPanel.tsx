"use client";

import { useEffect } from "react";
import { Eye, Loader2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { recordSeen, useSeenBy } from "@/hooks/use-seen";
import { relativeTime } from "@/lib/utils";

interface SeenPanelProps {
  conversationId: number;
  agentId: number;
  agentName: string;
}

export function SeenPanel({ conversationId, agentId, agentName }: SeenPanelProps) {
  const { data: seen, loading, reload } = useSeenBy(conversationId);

  // Ao abrir a conversa, registra que EU vi agora e recarrega a lista.
  useEffect(() => {
    if (!agentId) return;
    recordSeen({ conversation_id: conversationId, agent_id: agentId, agent_name: agentName })
      .then(() => reload())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, agentId]);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Eye className="h-3.5 w-3.5" /> Visto pela equipe
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : seen.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          Ninguém viu esta conversa ainda.
        </div>
      ) : (
        <ul className="space-y-2">
          {seen.map((s) => {
            const isMe = s.agent_id === agentId;
            return (
              <li key={s.agent_id} className="flex items-center gap-2.5">
                <Avatar name={s.agent_name || `#${s.agent_id}`} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">
                    {s.agent_name || `Agente #${s.agent_id}`}
                    {isMe ? (
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        (você)
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    visto {relativeTime(s.last_seen_at)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
