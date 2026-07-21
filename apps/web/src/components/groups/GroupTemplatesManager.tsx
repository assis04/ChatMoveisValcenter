"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Loader2,
  Lock,
  Megaphone,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ContactPicker } from "./ContactPicker";
import {
  createTemplate,
  deleteTemplate,
  updateTemplate,
  useTemplates,
} from "@/hooks/use-templates";
import type { ContactSuggestion } from "@/hooks/use-contacts-search";
import type { GroupTemplate } from "@/types";

// Template guarda { name, phone_number }; o ContactPicker trabalha com
// ContactSuggestion (precisa de id). Sintetizamos o id a partir do telefone.
export function toSuggestions(
  participants: { name: string; phone_number: string }[],
): ContactSuggestion[] {
  return participants.map((p) => ({
    id: Number(p.phone_number.replace(/\D/g, "")) || 0,
    name: p.name,
    phone_number: p.phone_number,
    thumbnail: null,
  }));
}

export function GroupTemplatesManager({ onBack }: { onBack: () => void }) {
  const { data: templates, loading, error, reload } = useTemplates();
  const [editing, setEditing] = useState<GroupTemplate | "new" | null>(null);

  if (editing) {
    return (
      <TemplateForm
        template={editing === "new" ? null : editing}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 border-b border-border/40 px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar aos grupos
      </button>

      <header className="flex items-center justify-between gap-4 px-4 py-4">
        <div>
          <h1 className="text-lg font-medium tracking-tight">
            Modelos de grupo
          </h1>
          <p className="text-xs text-muted-foreground">
            Time padrão + nome-base pra criar grupos em 1 clique
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-3.5 w-3.5" /> Novo modelo
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando modelos…
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhum modelo ainda.</p>
            <p className="text-xs text-muted-foreground/70">
              Crie um com o time interno padrão pra agilizar novos grupos.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40 rounded-lg border border-border/60">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <button
                  onClick={() => setEditing(t)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm">{t.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {t.participants.length} no time
                    {t.group_name_base ? ` • "${t.group_name_base}"` : ""}
                  </div>
                </button>
                <TemplateDeleteButton id={t.id} onDeleted={reload} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TemplateDeleteButton({
  id,
  onDeleted,
}: {
  id: string;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    if (!confirm("Excluir este modelo?")) return;
    setBusy(true);
    try {
      await deleteTemplate(id);
      onDeleted();
    } catch {
      setBusy(false);
    }
  };
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
      aria-label="Excluir modelo"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Trash2 className="h-4 w-4" />
      )}
    </button>
  );
}

function TemplateForm({
  template,
  onCancel,
  onSaved,
}: {
  template: GroupTemplate | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [nameBase, setNameBase] = useState(template?.group_name_base ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [participants, setParticipants] = useState<ContactSuggestion[]>(
    template ? toSuggestions(template.participants) : [],
  );
  const [announce, setAnnounce] = useState(template?.announce ?? false);
  const [restrict, setRestrict] = useState(template?.restrict ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (name.trim().length === 0) {
      setError("informe o nome do modelo");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: name.trim(),
      group_name_base: nameBase.trim(),
      description: description.trim(),
      participants: participants.map((p) => ({
        name: p.name,
        phone_number: p.phone_number,
      })),
      announce,
      restrict,
    };
    try {
      if (template) await updateTemplate(template.id, payload);
      else await createTemplate(payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "erro ao salvar");
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <button
        onClick={onCancel}
        className="flex items-center gap-1.5 border-b border-border/40 px-4 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar aos modelos
      </button>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <h1 className="text-base font-medium tracking-tight">
          {template ? "Editar modelo" : "Novo modelo"}
        </h1>

        <Field label="Nome do modelo">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Ex: Projeto padrão"
          />
        </Field>

        <Field
          label="Nome-base do grupo"
          hint="Vem preenchido ao criar; você completa com o cliente."
        >
          <Input
            value={nameBase}
            onChange={(e) => setNameBase(e.target.value)}
            maxLength={100}
            placeholder="Ex: Projeto — "
          />
        </Field>

        <Field label="Descrição padrão (opcional)">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={512}
            placeholder="Contexto padrão do grupo"
          />
        </Field>

        <Field label="Time interno (entra automático)">
          <ContactPicker selected={participants} onChange={setParticipants} />
        </Field>

        <div className="space-y-2">
          <Checkbox
            checked={announce}
            onChange={setAnnounce}
            icon={<Megaphone className="h-3.5 w-3.5" />}
            label="Só admins enviam (por padrão)"
          />
          <Checkbox
            checked={restrict}
            onChange={setRestrict}
            icon={<Lock className="h-3.5 w-3.5" />}
            label="Só admins editam infos (por padrão)"
          />
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}
      </div>

      <footer className="flex justify-end gap-2 border-t border-border/60 p-3">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={saving}>
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Salvar
        </Button>
      </footer>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground/70">{hint}</p>
      ) : null}
    </div>
  );
}

function Checkbox({
  checked,
  onChange,
  icon,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-2.5 rounded-md border border-border/60 px-3 py-2 text-left text-xs hover:bg-muted/20"
    >
      <span
        className={
          "flex h-4 w-4 items-center justify-center rounded border " +
          (checked ? "border-primary bg-primary text-white" : "border-border")
        }
      >
        {checked ? <Check className="h-3 w-3" /> : null}
      </span>
      <span className="text-muted-foreground">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
