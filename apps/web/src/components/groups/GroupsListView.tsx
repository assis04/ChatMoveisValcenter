"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { useGroups, useInboxes } from "@/hooks/use-groups";
import { CreateGroupModal } from "./CreateGroupModal";

export function GroupsListView() {
  const {
    data: inboxes,
    loading: inboxesLoading,
    error: inboxesError,
  } = useInboxes();

  const connected = useMemo(
    () => (inboxes ?? []).filter((i) => i.connection_status === "open"),
    [inboxes],
  );

  const [activeInboxId, setActiveInboxId] = useState<number | null>(null);
  const effectiveInboxId = activeInboxId ?? connected[0]?.inbox_id ?? null;

  const { data: groups, loading, error, reload } = useGroups(
    effectiveInboxId,
    { includeParticipants: false },
  );

  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!groups) return [];
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.subject.toLowerCase().includes(q));
  }, [groups, query]);

  return (
    <>
      <div className="mx-auto flex h-full max-w-3xl flex-col px-4 py-6 sm:px-6">
        <header className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-medium tracking-tight">
              Grupos de WhatsApp
            </h1>
            <p className="text-xs text-muted-foreground">
              Criar e gerenciar grupos das suas conexões
            </p>
          </div>
          <Button
            onClick={() => setCreateOpen(true)}
            disabled={connected.length === 0}
          >
            <Plus className="h-3.5 w-3.5" /> Novo grupo
          </Button>
        </header>

        {inboxesLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando
            conexões...
          </div>
        ) : inboxesError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {inboxesError}
          </div>
        ) : connected.length === 0 ? (
          <div className="rounded-md border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground">
            Nenhuma conexão WhatsApp ativa. Conecte uma instância em{" "}
            <strong>Configurações → Caixas de entrada</strong>.
          </div>
        ) : (
          <>
            {connected.length > 1 ? (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {connected.map((i) => (
                  <button
                    key={i.inbox_id}
                    onClick={() => setActiveInboxId(i.inbox_id)}
                    className={
                      "rounded-full border px-3 py-1 text-xs transition-colors " +
                      (effectiveInboxId === i.inbox_id
                        ? "border-primary/60 bg-primary/15 text-primary"
                        : "border-border bg-muted/30 text-muted-foreground hover:text-foreground")
                    }
                  >
                    {i.inbox_name}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar grupo pelo nome..."
                className="pl-9"
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando
                  grupos...
                </div>
              ) : error ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  {error}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <Users className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    {query
                      ? "Nenhum grupo encontrado pra essa busca."
                      : "Esta conexão ainda não tem grupos."}
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border/40 rounded-lg border border-border/60">
                  {filtered.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center gap-3 px-3 py-2.5"
                    >
                      <Avatar
                        name={g.subject}
                        src={g.pictureUrl ?? undefined}
                        size={36}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{g.subject}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {g.size ? `${g.size} membros` : "—"}
                          {g.desc ? ` • ${g.desc}` : ""}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <CreateGroupModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        inboxes={connected}
        {...(effectiveInboxId !== null ? { initialInboxId: effectiveInboxId } : {})}
        onCreated={() => {
          setCreateOpen(false);
          reload();
        }}
      />
    </>
  );
}
