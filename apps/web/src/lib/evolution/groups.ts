import { evolutionRequest } from "./client";
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

// A listagem de grupos vem do findChats (le do banco do Evolution, ~200ms) em
// vez do fetchAllGroups ao vivo do Baileys, que o WhatsApp rate-limita ate
// travar (5min+) quando o numero passa de ~150 grupos. Detalhe de cada grupo
// (membros, descricao) continua vindo do findGroupInfos ao abrir o grupo.
export async function fetchAllGroups(
  instance: string,
  _getParticipants = false,
): Promise<EvolutionGroup[]> {
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
