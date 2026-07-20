"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Crown,
  Link2,
  Loader2,
  LogOut,
  MoreVertical,
  Pencil,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import {
  leaveGroup,
  patchGroup,
  revokeGroupInvite,
  updateParticipants,
  useGroup,
  useGroupInvite,
} from "@/hooks/use-groups";
import { useResolvedContacts } from "@/hooks/use-resolved-contacts";
import { ContactPicker } from "./ContactPicker";
import type { ContactSuggestion } from "@/hooks/use-contacts-search";
import { formatBrPhone } from "@/lib/utils";

interface GroupMembersPanelProps {
  inboxId: number;
  jid: string;
  onBack?: () => void;
}

export function GroupMembersPanel({
  inboxId,
  jid,
  onBack,
}: GroupMembersPanelProps) {
  const { data: group, loading, error, reload } = useGroup(inboxId, jid);
  const [addOpen, setAddOpen] = useState(false);
  const [picked, setPicked] = useState<ContactSuggestion[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const sortedParticipants = useMemo(() => {
    const list = group?.participants ?? [];
    return [...list].sort((a, b) => {
      const rank = (p: { admin: string | null }) =>
        p.admin === "superadmin" ? 0 : p.admin === "admin" ? 1 : 2;
      return rank(a) - rank(b);
    });
  }, [group]);

  const phones = useMemo(
    () => sortedParticipants.map((p) => p.id.split("@")[0] ?? ""),
    [sortedParticipants],
  );
  const resolved = useResolvedContacts(phones);
  const invite = useGroupInvite(inboxId, jid);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando grupo...
      </div>
    );
  }
  if (error || !group) {
    return (
      <div className="flex h-full flex-col">
        {onBack ? <BackBar onBack={onBack} /> : null}
        <div className="m-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {error ?? "Grupo não encontrado"}
        </div>
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
      await updateParticipants({ inbox_id: inboxId, jid, action, participants });
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

  const copyInvite = async () => {
    if (!invite.data) return;
    try {
      await navigator.clipboard.writeText(invite.data.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard pode ser bloqueado no iframe; ignora
    }
  };

  const handleRevoke = async () => {
    if (!confirm("Gerar um novo link invalida o link atual. Continuar?")) return;
    setRevoking(true);
    try {
      await revokeGroupInvite({ inbox_id: inboxId, jid });
      await invite.reload();
    } catch {
      // erro reaparece no bloco de convite ao recarregar
    } finally {
      setRevoking(false);
    }
  };

  const startEdit = () => {
    setEditSubject(group.subject);
    setEditDesc(group.desc ?? "");
    setActionError(null);
    setEditing(true);
  };

  const saveEdit = async () => {
    const patch: { subject?: string; description?: string } = {};
    const s = editSubject.trim();
    const d = editDesc.trim();
    if (s && s !== group.subject) patch.subject = s;
    if (d !== (group.desc ?? "")) patch.description = d;
    if (patch.subject === undefined && patch.description === undefined) {
      setEditing(false);
      return;
    }
    setPending("edit");
    setActionError(null);
    try {
      await patchGroup({ inbox_id: inboxId, jid, ...patch });
      await reload();
      setEditing(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "erro ao salvar");
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {onBack ? <BackBar onBack={onBack} /> : null}

      <header className="border-b border-border/60">
        <div className="flex items-start gap-3 p-4">
          <Avatar
            name={group.subject}
            src={group.pictureUrl ?? undefined}
            size={44}
          />
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-2">
                <Input
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  maxLength={100}
                  placeholder="Nome do grupo"
                />
                <Input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  maxLength={512}
                  placeholder="Descrição (opcional)"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(false)}
                    disabled={pending === "edit"}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveEdit}
                    disabled={pending === "edit"}
                  >
                    {pending === "edit" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Salvar
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <h1 className="truncate text-base font-medium tracking-tight">
                    {group.subject}
                  </h1>
                  <button
                    onClick={startEdit}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    aria-label="Editar grupo"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {sortedParticipants.length} participantes
                  {group.announce ? (
                    <span className="ml-1">• só admins enviam</span>
                  ) : null}
                </p>
                {group.desc ? (
                  <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                    {group.desc}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>

      </header>

      <div className="border-b border-border/40 px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Link de convite
          </span>
          {invite.data ? (
            <button
              onClick={handleRevoke}
              disabled={revoking}
              className="text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              {revoking ? "Gerando…" : "Gerar novo"}
            </button>
          ) : null}
        </div>
        {invite.loading ? (
          <div className="text-xs text-muted-foreground">Carregando link…</div>
        ) : invite.error ? (
          <div className="text-xs text-muted-foreground/70">
            Link indisponível — o número precisa ser admin do grupo.
          </div>
        ) : invite.data ? (
          <button
            onClick={copyInvite}
            className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-left transition-colors hover:bg-muted/30"
            title="Copiar link"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs">
              {invite.data.inviteUrl}
            </span>
            {copied ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
            ) : (
              <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
          </button>
        ) : null}
      </div>

      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Participantes
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setAddOpen((v) => !v)}
        >
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
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={picked.length === 0 || pending === "add"}
            >
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
          const info = resolved[phone.replace(/\D/g, "")];
          const display = info?.name ?? formatBrPhone(phone);
          const isBusy = pending === p.id;
          return (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar
                name={info?.name ?? phone}
                src={info?.thumbnail ?? undefined}
                size={32}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="truncate">{display}</span>
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
                {info ? (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {formatBrPhone(phone)}
                  </div>
                ) : null}
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

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1.5 border-b border-border/40 px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> Voltar aos grupos
    </button>
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
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
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
