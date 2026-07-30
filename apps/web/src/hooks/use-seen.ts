"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { ConversationSeenEntry, UnseenConversation } from "@/types";

export async function recordSeen(input: {
  conversation_id: number;
  agent_id: number;
  agent_name: string;
}): Promise<void> {
  await api(`/api/seen`, { method: "POST", body: input });
}

export function useSeenBy(conversationId: number | null) {
  const [data, setData] = useState<ConversationSeenEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!conversationId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ seen: ConversationSeenEntry[] }>(
        `/api/seen?conversation_id=${conversationId}`,
      );
      setData(res.seen);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, reload };
}

export function useUnseen(agentId: number | null) {
  const [data, setData] = useState<UnseenConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!agentId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ unseen: UnseenConversation[] }>(
        `/api/unseen?agent_id=${agentId}`,
      );
      setData(res.unseen);
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}
