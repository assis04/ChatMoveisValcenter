import { chatwootRequest } from "./client";

export interface ChatwootConversationLite {
  id: number;
  inbox_id: number;
  status: string;
  last_activity_at: number; // epoch seconds
  contact_name: string;
  last_message: string;
}

interface RawConversation {
  id: number;
  inbox_id: number;
  status: string;
  last_activity_at?: number;
  timestamp?: number;
  messages?: { content?: string; created_at?: number }[];
  meta?: { sender?: { name?: string } };
}

// Lista as conversas abertas da conta (de todos os agentes). Usado pra cruzar
// com o "visto por agente" e montar a lista de "não vistas por mim".
export async function fetchOpenConversations(
  accountId: number,
): Promise<ChatwootConversationLite[]> {
  const res = await chatwootRequest<{ data?: { payload?: RawConversation[] } }>({
    accountId,
    path: `/conversations?status=open&assignee_type=all`,
  });
  const payload = res.data?.payload ?? [];
  return payload.map((c) => {
    const last = c.messages?.length ? c.messages[c.messages.length - 1] : undefined;
    return {
      id: c.id,
      inbox_id: c.inbox_id,
      status: c.status,
      last_activity_at: c.last_activity_at ?? c.timestamp ?? last?.created_at ?? 0,
      contact_name: c.meta?.sender?.name ?? `Conversa #${c.id}`,
      last_message: last?.content ?? "",
    };
  });
}
