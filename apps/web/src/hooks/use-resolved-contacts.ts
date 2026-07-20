"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";

export interface ResolvedContact {
  name: string;
  thumbnail: string | null;
}

// Given a list of participant phone numbers (bare digits), returns a map
// digits -> { name, thumbnail } for those that match a Chatwoot contact.
// Unmatched numbers simply stay absent (caller falls back to the number).
export function useResolvedContacts(
  phones: string[],
): Record<string, ResolvedContact> {
  const [map, setMap] = useState<Record<string, ResolvedContact>>({});

  // Stable primitive dep: sorted unique digits. Avoids re-firing on array
  // identity changes while still reacting to a genuinely different set.
  const key = Array.from(new Set(phones.map((p) => p.replace(/\D/g, ""))))
    .filter(Boolean)
    .sort()
    .join(",");

  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (list.length === 0) {
      setMap({});
      return;
    }
    let cancelled = false;
    api<{ resolved: Record<string, ResolvedContact> }>(`/api/contacts/resolve`, {
      method: "POST",
      body: { phones: list },
    })
      .then((res) => {
        if (!cancelled) setMap(res.resolved);
      })
      .catch(() => {
        // silent: names are a nicety, numbers are the fallback
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return map;
}
