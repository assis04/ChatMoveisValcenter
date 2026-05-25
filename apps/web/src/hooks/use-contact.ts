"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

export interface ChatwootContactDetails {
  id: number;
  name: string;
  email: string | null;
  phone_number: string | null;
  identifier: string | null;
  thumbnail: string | null;
}

export function useContact(contactId: number | null) {
  const [data, setData] = useState<ChatwootContactDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<{ contact: ChatwootContactDetails }>(`/api/contacts/${contactId}`)
      .then((res) => {
        if (!cancelled) setData(res.contact);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "erro");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  return { data, loading, error };
}
