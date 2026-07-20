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

export async function fetchAllGroups(
  instance: string,
  getParticipants = false,
): Promise<EvolutionGroup[]> {
  const qs = `?getParticipants=${getParticipants ? "true" : "false"}`;
  return evolutionRequest<EvolutionGroup[]>({
    path: `/group/fetchAllGroups/${encodeURIComponent(instance)}${qs}`,
    // fetchAllGroups pode levar 125s+ (ADM passa de 180s); damos folga generosa
    timeoutMs: 280_000,
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
    method: "PUT",
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
    method: "PUT",
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
    method: "PUT",
    path: `/group/updateGroupDescription/${encodeURIComponent(instance)}?groupJid=${encodeURIComponent(groupJid)}`,
    body: { description },
  });
}

// Group-level permission settings:
//  - announcement / not_announcement → só admins enviam mensagens (ou todos)
//  - locked / unlocked              → só admins editam infos do grupo (ou todos)
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
    method: "PUT",
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
    method: "PUT",
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
