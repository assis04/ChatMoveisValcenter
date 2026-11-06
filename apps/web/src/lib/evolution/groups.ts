import { evolutionRequest } from "./client";
import { listRegistryGroups, type RegistryGroup } from "./chat-registry";
import type {
  EvolutionGroup,
  EvolutionGroupParticipant,
  ParticipantAction,
} from "@/types";

// Evolution accepts participants as bare digits or with @s.whatsapp.net.
// We normalize to digits at the boundary so callers can pass either form.
function normalizeParticipant(raw: string): string {
  const digits = raw.replace(/@s\.whatsapp\.net$/i, "").replace(/\D/g, "");
  if (digits.length < 8) {
    throw new Error(`invalid participant phone: "${raw}"`);
  }
  return digits;
}

function assertGroupJid(jid: string): void {
  if (!jid.endsWith("@g.us")) {
    throw new Error(`invalid group jid: "${jid}"`);
  }
}

export interface CreateGroupInput {
  instance: string;
  subject: string;
  participants: string[];
  description?: string;
}

export async function createGroup(
  input: CreateGroupInput,
): Promise<EvolutionGroup> {
  const body: Record<string, unknown> = {
    subject: input.subject,
    participants: input.participants.map(normalizeParticipant),
  };
  if (input.description) body.description = input.description;

  return evolutionRequest<EvolutionGroup>({
    method: "POST",
    path: `/group/create/${encodeURIComponent(input.instance)}`,
    body,
  });
}

interface EvolutionChat {
  remoteJid?: string;
  id?: string;
  pushName?: string | null;
  profilePicUrl?: string | null;
  updatedAt?: string | null;
}

// Fonte 1 (rapida, ~200ms): findChats le o banco do Evolution. So traz grupos
// com atividade de chat sincronizada — pode FALTAR grupos onde o numero e membro
// mas ainda nao teve mensagem sincronizada (tipico de numero recem-pareado).
async function groupsFromChats(instance: string): Promise<EvolutionGroup[]> {
  const chats = await evolutionRequest<EvolutionChat[]>({
    method: "POST",
    path: `/chat/findChats/${encodeURIComponent(instance)}`,
    body: {},
    timeoutMs: 30_000,
  });

  const list = Array.isArray(chats) ? chats : [];
  return list
    .filter((c) => String(c.remoteJid ?? c.id ?? "").endsWith("@g.us"))
    .sort((a, b) =>
      String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
    )
    .map((c) => {
      const jid = String(c.remoteJid ?? c.id ?? "");
      const group: EvolutionGroup = {
        id: jid,
        subject: c.pushName?.trim() || jid.split("@")[0] || jid,
        pictureUrl: c.profilePicUrl ?? null,
      };
      return group;
    });
}

// Fonte 2: o registro da tabela "Chat" (ver chat-registry.ts) = todos os grupos de
// que o numero participa, com ou sem mensagem, lido do banco local da Evolution.
// Substitui a membresia ao vivo (/group/fetchAllGroups), desligada em 2026-10-05
// porque martelava o WhatsApp com metadata de 500-1400 grupos -> rate-overlimit ->
// os numeros deslogavam em loop. NAO religar a membresia ao vivo.
//
// Ordem da lista: grupos novos (ultimos 14 dias) ainda sem mensagem no topo, depois
// os com atividade (ordem do findChats) e por fim os parados.
const NEW_GROUP_WINDOW_MS = 14 * 24 * 3600_000;

export async function fetchAllGroups(
  instance: string,
  _getParticipants = false,
): Promise<EvolutionGroup[]> {
  const [chatRes, regRes] = await Promise.allSettled([
    groupsFromChats(instance),
    listRegistryGroups(instance),
  ]);
  // Lista parcial e pior que lista velha: se o registro falhar, lanca e o cache
  // mantem a ultima lista boa (em vez de sumir com os grupos sem mensagem).
  if (regRes.status === "rejected") throw regRes.reason;
  const registry = regRes.value; // null = registro desligado (sem EVOLUTION_DB_URL)
  if (chatRes.status === "rejected" && !registry) throw chatRes.reason;
  const chats = chatRes.status === "fulfilled" ? chatRes.value : [];
  if (!registry) return chats;

  const reg = new Map(registry.map((g) => [g.id, g]));
  const inChats = new Set(chats.map((g) => g.id));
  const toGroup = (r: RegistryGroup): EvolutionGroup => ({
    id: r.id,
    subject: r.subject || r.id.split("@")[0] || r.id,
    pictureUrl: null,
  });
  // O findChats usa o pushName, que pode vir vazio (ai o "nome" vira o numero do JID
  // e a busca por nome nao acha); nesse caso vale o nome guardado no registro.
  const named = (g: EvolutionGroup): EvolutionGroup => {
    const r = reg.get(g.id);
    return r?.subject && g.subject === g.id.split("@")[0] ? { ...g, subject: r.subject } : g;
  };
  const now = Date.now();
  const onlyReg = registry.filter((r) => !inChats.has(r.id));
  const fresh = onlyReg
    .filter((r) => now - r.createdAt < NEW_GROUP_WINDOW_MS)
    .sort((a, b) => b.createdAt - a.createdAt);
  const idle = onlyReg
    .filter((r) => now - r.createdAt >= NEW_GROUP_WINDOW_MS)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return [...fresh.map(toGroup), ...chats.map(named), ...idle.map(toGroup)];
}

export async function findGroupInfos(
  instance: string,
  groupJid: string,
): Promise<EvolutionGroup> {
  assertGroupJid(groupJid);
  return evolutionRequest<EvolutionGroup>({
    path: `/group/findGroupInfos/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`,
  });
}

export interface GroupInvite {
  inviteUrl: string;
  inviteCode: string;
}

export async function fetchGroupInviteCode(
  instance: string,
  groupJid: string,
): Promise<GroupInvite> {
  assertGroupJid(groupJid);
  return evolutionRequest<GroupInvite>({
    path: `/group/inviteCode/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`,
  });
}

// Revoga o link atual e gera um novo (invalida qualquer link compartilhado).
// Método POST nesta build (não PUT).
export async function revokeGroupInviteCode(
  instance: string,
  groupJid: string,
): Promise<GroupInvite> {
  assertGroupJid(groupJid);
  return evolutionRequest<GroupInvite>({
    method: "POST",
    path: `/group/revokeInviteCode/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`,
  });
}

export async function fetchParticipants(
  instance: string,
  groupJid: string,
): Promise<EvolutionGroupParticipant[]> {
  assertGroupJid(groupJid);
  const res = await evolutionRequest<{
    participants: EvolutionGroupParticipant[];
  }>({
    path: `/group/participants/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`,
  });
  return res.participants;
}

export interface UpdateParticipantsInput {
  instance: string;
  groupJid: string;
  action: ParticipantAction;
  participants: string[];
}

export async function updateGroupParticipants(
  input: UpdateParticipantsInput,
): Promise<unknown> {
  assertGroupJid(input.groupJid);
  return evolutionRequest({
    method: "POST",
    path: `/group/updateParticipant/${encodeURIComponent(input.instance)}?groupJid=${encodeURIComponent(input.groupJid)}`,
    body: {
      action: input.action,
      participants: input.participants.map(normalizeParticipant),
    },
  });
}

export async function updateGroupSubject(
  instance: string,
  groupJid: string,
  subject: string,
): Promise<unknown> {
  assertGroupJid(groupJid);
  return evolutionRequest({
    method: "POST",
    path: `/group/updateGroupSubject/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`,
    body: { subject },
  });
}

export async function updateGroupDescription(
  instance: string,
  groupJid: string,
  description: string,
): Promise<unknown> {
  assertGroupJid(groupJid);
  return evolutionRequest({
    method: "POST",
    path: `/group/updateGroupDescription/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`,
    body: { description },
  });
}

// Permissões do grupo (só surtem efeito se a instância for admin):
//  - announcement / not_announcement → só admins enviam mensagens (ou todos)
//  - locked / unlocked              → só admins editam infos do grupo (ou todos)
// NOTA: nesta build do Evolution (evoapicloud v2.3.7) o método é POST, não PUT.
export type GroupSettingAction =
  | "announcement"
  | "not_announcement"
  | "locked"
  | "unlocked";

export async function updateGroupSetting(
  instance: string,
  groupJid: string,
  action: GroupSettingAction,
): Promise<unknown> {
  assertGroupJid(groupJid);
  return evolutionRequest({
    method: "POST",
    path: `/group/updateSetting/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`,
    body: { action },
  });
}

export async function updateGroupPicture(
  instance: string,
  groupJid: string,
  image: string,
): Promise<unknown> {
  assertGroupJid(groupJid);
  return evolutionRequest({
    method: "POST",
    path: `/group/updateGroupPicture/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`,
    body: { image },
  });
}

export async function leaveGroup(
  instance: string,
  groupJid: string,
): Promise<unknown> {
  assertGroupJid(groupJid);
  return evolutionRequest({
    method: "DELETE",
    path: `/group/leaveGroup/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`,
  });
}
