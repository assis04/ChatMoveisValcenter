"use client";

import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Crown,
  Loader2,
  LogOut,
  MoreVertical,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import {
  leaveGroup,
  updateParticipants,
  useGroup,
} from "@/hooks/use-groups";
import { ContactPicker } from "./ContactPicker";
import type { ContactSuggestion } from "@/hooks/use-contacts-search";
import { formatBrPhone } from "@/lib/utils";

interface GroupMembersPanelProps {
  inboxId: number;
  jid: string;
}

export function GroupMembersPanel({ inboxId, jid }: GroupMembersPanelProps) {
  const { data: group, loading, error, reload } = useGroup(inboxId, jid);
  const [addOpen, setAddOpen] = useState(false);
  const [picked, setPicked] = useState<ContactSuggestion[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const sortedParticipants = useMemo(() => {
    const list = group?.participants ?? [];
    return [...list].sort((a, b) => {
      const rank = (p: { admin: string | null }) =>
        p.admin === "superadmin" ? 0 : p.admin === "admin" ? 1 : 2;
      return rank(a) - rank(b);
    });
  }, [group]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando grupo...
      </div>
    );
  }
  if (error || !group) {
    return (
      <div className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
        {error ?? "Grupo não encontrado"}
      </div>
    );
  }

  const callAction = async (
    action: "add" | "remove" | "promote" | "demote",
    participants: string[],
  ) => {
    setPending(action);
    setActionError(null);
    try {
      await updateParticipants({
        inbox_id: inboxId,
        jid,
        action,
        participants,
      });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "erro");
    } finally {
      setPending(null);
    }
  };

  const handleAdd = async () => {
    if (picked.length === 0) return;
    await callAction("add", picked.map((p) => p.phone_number));
    if (!actionError) {
      setPicked([]);
      setAddOpen(false);
    }
  };

  const handleLeave = async () => {
    if (!confirm("Sair do grupo? Essa ação não pode ser desfeita.")) return;
    setPending("leave");
    setActionError(null);
    try {
      await leaveGroup({ inbox_id: inboxId, jid });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "erro");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/60 p-4">
        <div className="flex items-start gap-3">
          <Avatar
            name={group.subject}
            src={group.pictureUrl ?? undefined}
            size={44}
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-medium tracking-tight">
              {group.subject}
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3 w-3" />
              {sortedParticipants.length} participantes
              {group.announce ? <span className="ml-2">• só admins enviam</span> : null}
            </p>
          </div>
        </div>
        {group.desc ? (
          <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">
            {group.desc}
          </p>
        ) : null}
      </header>

      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Participantes
        </span>
        <Button size="sm" variant="secondary" onClick={() => setAddOpen((v) => !v)}>
          <UserPlus className="h-3.5 w-3.5" />
          {addOpen ? "Cancelar" : "Adicionar"}
        </Button>
      </div>

      {addOpen ? (
        <div className="space-y-3 border-b border-border/40 bg-muted/10 p-4">
          <ContactPicker
            selected={picked}
            onChange={setPicked}
            excludeIds={new Set()}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={picked.length === 0 || pending === "add"}>
              {pending === "add" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              Adicionar {picked.length > 0 ? `(${picked.length})` : ""}
            </Button>
          </div>
        </div>
      ) : null}

      {actionError ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {actionError}
        </div>
      ) : null}

      <ul className="flex-1 divide-y divide-border/40 overflow-y-auto">
        {sortedParticipants.map((p) => {
          const phone = p.id.split("@")[0] ?? "";
          const isBusy = pending === p.id;
          return (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar name={phone} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="truncate">{formatBrPhone(phone)}</span>
                  {p.admin === "superadmin" ? (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      <Crown className="h-2.5 w-2.5" /> dono
                    </span>
                  ) : p.admin === "admin" ? (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      <Crown className="h-2.5 w-2.5" /> admin
                    </span>
                  ) : null}
                </div>
              </div>
              <ParticipantMenu
                isAdmin={p.admin !== null}
                isOwner={p.admin === "superadmin"}
                disabled={isBusy || pending !== null}
                onPromote={() => callAction("promote", [phone])}
                onDemote={() => callAction("demote", [phone])}
                onRemove={() => callAction("remove", [phone])}
              />
            </li>
          );
        })}
      </ul>

      <footer className="border-t border-border/60 p-3">
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={handleLeave}
          disabled={pending !== null}
        >
          <LogOut className="h-3.5 w-3.5" />
          Sair do grupo
        </Button>
      </footer>
    </div>
  );
}

function ParticipantMenu({
  isAdmin,
  isOwner,
  disabled,
  onPromote,
  onDemote,
  onRemove,
}: {
  isAdmin: boolean;
  isOwner: boolean;
  disabled: boolean;
  onPromote: () => void;
  onDemote: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (isOwner) return <span className="text-[10px] text-muted-foreground/60" />;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground disabled:opacity-30"
        aria-label="Ações"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open ? (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-md border border-border bg-background shadow-lg">
            {isAdmin ? (
              <button
                onClick={() => {
                  setOpen(false);
                  onDemote();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40"
              >
                <ArrowUpRight className="h-3 w-3 rotate-180" /> Remover admin
              </button>
            ) : (
              <button
                onClick={() => {
                  setOpen(false);
                  onPromote();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/40"
              >
                <Crown className="h-3 w-3" /> Tornar admin
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false);
                onRemove();
              }}
              className="flex w-full items-center gap-2 border-t border-border/60 px-3 py-2 text-left text-xs text-destructive hover:bg-destructive/10"
            >
              <UserMinus className="h-3 w-3" /> Remover do grupo
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
