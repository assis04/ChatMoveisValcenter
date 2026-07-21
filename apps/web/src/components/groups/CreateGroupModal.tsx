"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ContactPicker } from "./ContactPicker";
import { toSuggestions } from "./GroupTemplatesManager";
import { createGroup, patchGroup } from "@/hooks/use-groups";
import { useTemplates } from "@/hooks/use-templates";
import type { ContactSuggestion } from "@/hooks/use-contacts-search";
import type { GroupTemplate, InboxInstanceMapping } from "@/types";
import { Loader2 } from "lucide-react";

interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  inboxes: InboxInstanceMapping[];
  initialInboxId?: number;
  onCreated: (groupJid: string, inboxId: number) => void;
}

export function CreateGroupModal({
  open,
  onClose,
  inboxes,
  initialInboxId,
  onCreated,
}: CreateGroupModalProps) {
  const connected = inboxes.filter((i) => i.connection_status === "open");
  const [inboxId, setInboxId] = useState<number | null>(
    initialInboxId ?? connected[0]?.inbox_id ?? null,
  );
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [participants, setParticipants] = useState<ContactSuggestion[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: templates } = useTemplates();
  const [templateId, setTemplateId] = useState<string>("");
  const [applied, setApplied] = useState<GroupTemplate | null>(null);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id) ?? null;
    setApplied(t);
    if (t) {
      setSubject(t.group_name_base);
      setDescription(t.description);
      setParticipants(toSuggestions(t.participants));
    }
  };

  const reset = () => {
    setSubject("");
    setDescription("");
    setParticipants([]);
    setError(null);
    setSubmitting(false);
    setTemplateId("");
    setApplied(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!inboxId) {
      setError("selecione uma conexão");
      return;
    }
    if (subject.trim().length === 0) {
      setError("informe o nome do grupo");
      return;
    }
    if (participants.length === 0) {
      setError("adicione pelo menos um participante");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const group = await createGroup({
        inbox_id: inboxId,
        subject: subject.trim(),
        participants: participants.map((p) => p.phone_number),
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      // Aplica permissões padrão do modelo (best-effort; não bloqueia a criação).
      if (applied && (applied.announce || applied.restrict)) {
        try {
          await patchGroup({
            inbox_id: inboxId,
            jid: group.id,
            ...(applied.announce ? { announce: true } : {}),
            ...(applied.restrict ? { restrict: true } : {}),
          });
        } catch {
          // grupo já foi criado; permissão é secundária
        }
      }
      onCreated(group.id, inboxId);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro ao criar grupo");
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo grupo"
      description="Crie um grupo de WhatsApp diretamente do atendimento."
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Criando...
              </>
            ) : (
              "Criar grupo"
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {templates.length > 0 ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Modelo
            </label>
            <select
              value={templateId}
              onChange={(e) => applyTemplate(e.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background/40 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="">Começar em branco</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {applied ? (
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                Nome e time preenchidos pelo modelo — ajuste o que precisar.
              </p>
            ) : null}
          </div>
        ) : null}

        {connected.length > 1 ? (
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Conexão
            </label>
            <select
              value={inboxId ?? ""}
              onChange={(e) => setInboxId(Number(e.target.value))}
              className="h-9 w-full rounded-md border border-border bg-background/40 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {connected.map((i) => (
                <option key={i.inbox_id} value={i.inbox_id}>
                  {i.inbox_name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Nome do grupo
          </label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={100}
            placeholder="Ex: Projeto Apto 102 - Cliente Silva"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Descrição (opcional)
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={512}
            placeholder="Breve contexto do grupo"
          />
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Participantes
          </label>
          <ContactPicker
            selected={participants}
            onChange={setParticipants}
          />
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
