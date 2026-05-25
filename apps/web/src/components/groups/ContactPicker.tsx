"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import {
  useContactsSearch,
  type ContactSuggestion,
} from "@/hooks/use-contacts-search";
import { formatBrPhone } from "@/lib/utils";

interface ContactPickerProps {
  selected: ContactSuggestion[];
  onChange: (next: ContactSuggestion[]) => void;
  excludeIds?: Set<number>;
}

export function ContactPicker({
  selected,
  onChange,
  excludeIds,
}: ContactPickerProps) {
  const [query, setQuery] = useState("");
  const { data, loading, error } = useContactsSearch(query);

  const selectedIds = new Set(selected.map((c) => c.id));
  const visible = data.filter(
    (c) => !selectedIds.has(c.id) && !excludeIds?.has(c.id),
  );

  const toggle = (c: ContactSuggestion) => {
    if (selectedIds.has(c.id)) {
      onChange(selected.filter((s) => s.id !== c.id));
    } else {
      onChange([...selected, c]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar contato por nome ou telefone..."
          className="pl-9"
        />
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-1 pl-1 pr-2 text-xs"
            >
              <Avatar name={c.name} size={20} />
              <span className="max-w-[120px] truncate">{c.name}</span>
              <button
                onClick={() => toggle(c)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Remover"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="min-h-[140px] rounded-lg border border-border/60 bg-background/40">
        {error ? (
          <div className="p-4 text-xs text-destructive">{error}</div>
        ) : loading ? (
          <div className="p-4 text-xs text-muted-foreground">Buscando...</div>
        ) : query.trim().length < 2 ? (
          <div className="p-4 text-xs text-muted-foreground">
            Digite ao menos 2 caracteres pra buscar contatos cadastrados.
          </div>
        ) : visible.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground">
            Nenhum contato encontrado.
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {visible.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => toggle(c)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30"
                >
                  <Avatar name={c.name} src={c.thumbnail} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{c.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatBrPhone(c.phone_number)}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
