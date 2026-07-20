"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type {
  EvolutionGroup,
  EvolutionGroupParticipant,
  InboxInstanceMapping,
  ParticipantAction,
} from "@/types";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function initial<T>(): AsyncState<T> {
  return { data: null, loading: true, error: null };
}

export function useInboxes() {
  const [state, setState] = useState<AsyncState<InboxInstanceMapping[]>>(
    initial(),
  );

  const refresh = useCallback(async (force = false) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await api<{ inboxes: InboxInstanceMapping[] }>(
        `/api/inboxes${force ? "?refresh=true" : ""}`,
      );
      setState({ data: res.inboxes, loading: false, error: null });
    } catch (err) {
      setState({
        data: null,
        loading: false,
        error: err instanceof Error ? err.message : "erro desconhecido",
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...state, refresh };
}

export function useGroups(
  inboxId: number | null,
  options: { includeParticipants?: boolean } = {},
) {
  const [state, setState] = useState<AsyncState<EvolutionGroup[]>>(initial());

  const reload = useCallback(async () => {
    if (!inboxId) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const qs = new URLSearchParams({ inbox_id: String(inboxId) });
      if (options.includeParticipants) qs.set("participants", "true");
      const res = await api<{ groups: EvolutionGroup[] }>(
        `/api/groups?${qs.toString()}`,
      );
      setState({ data: res.groups, loading: false, error: null });
    } catch (err) {
      setState({
        data: null,
        loading: false,
        error: err instanceof Error ? err.message : "erro desconhecido",
      });
    }
  }, [inboxId, options.includeParticipants]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

export function useGroup(inboxId: number | null, jid: string | null) {
  const [state, setState] = useState<AsyncState<EvolutionGroup>>(initial());

  const reload = useCallback(async () => {
    if (!inboxId || !jid) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await api<{ group: EvolutionGroup }>(
        `/api/groups/${encodeURIComponent(jid)}?inbox_id=${inboxId}`,
      );
      setState({ data: res.group, loading: false, error: null });
    } catch (err) {
      setState({
        data: null,
        loading: false,
        error: err instanceof Error ? err.message : "erro desconhecido",
      });
    }
  }, [inboxId, jid]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { ...state, reload };
}

// ─── Mutations ────────────────────────────────────────────────

export async function createGroup(input: {
  inbox_id: number;
  subject: string;
  participants: string[];
  description?: string;
}): Promise<EvolutionGroup> {
  const res = await api<{ group: EvolutionGroup }>(`/api/groups`, {
    method: "POST",
    body: input,
  });
  return res.group;
}

export async function updateParticipants(input: {
  inbox_id: number;
  jid: string;
  action: ParticipantAction;
  participants: string[];
}): Promise<void> {
  await api(
    `/api/groups/${encodeURIComponent(input.jid)}/participants?inbox_id=${input.inbox_id}`,
    {
      method: "POST",
      body: { action: input.action, participants: input.participants },
    },
  );
}

export async function patchGroup(input: {
  inbox_id: number;
  jid: string;
  subject?: string;
  description?: string;
  picture?: string;
  announce?: boolean;
  restrict?: boolean;
}): Promise<void> {
  const body: Record<string, unknown> = {};
  if (input.subject !== undefined) body.subject = input.subject;
  if (input.description !== undefined) body.description = input.description;
  if (input.picture !== undefined) body.picture = input.picture;
  if (input.announce !== undefined) body.announce = input.announce;
  if (input.restrict !== undefined) body.restrict = input.restrict;

  await api(`/api/groups/${encodeURIComponent(input.jid)}?inbox_id=${input.inbox_id}`, {
    method: "PATCH",
    body,
  });
}

export async function leaveGroup(input: {
  inbox_id: number;
  jid: string;
}): Promise<void> {
  await api(`/api/groups/${encodeURIComponent(input.jid)}?inbox_id=${input.inbox_id}`, {
    method: "DELETE",
  });
}

export type { EvolutionGroup, EvolutionGroupParticipant };
