"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { GroupTemplate, GroupTemplateParticipant } from "@/types";

export function useTemplates() {
  const [data, setData] = useState<GroupTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ templates: GroupTemplate[] }>(
        `/api/group-templates`,
      );
      setData(res.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro ao carregar modelos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}

export interface TemplateInput {
  name: string;
  group_name_base: string;
  description: string;
  participants: GroupTemplateParticipant[];
  announce: boolean;
  restrict: boolean;
}

export async function createTemplate(
  input: TemplateInput,
): Promise<GroupTemplate> {
  const res = await api<{ template: GroupTemplate }>(`/api/group-templates`, {
    method: "POST",
    body: input,
  });
  return res.template;
}

export async function updateTemplate(
  id: string,
  input: Partial<TemplateInput>,
): Promise<void> {
  await api(`/api/group-templates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  await api(`/api/group-templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
