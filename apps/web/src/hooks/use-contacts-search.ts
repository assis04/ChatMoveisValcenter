"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

export interface ContactSuggestion {
  id: number;
  name: string;
  phone_number: string;
  thumbnail: string | null;
}

export function useContactsSearch(query: string, debounceMs = 250) {
  const [data, setData] = useState<ContactSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setData([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api<{ contacts: ContactSuggestion[] }>(
          `/api/contacts/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        setData(res.contacts);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "erro ao buscar");
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, debounceMs]);

  return { data, loading, error };
}
