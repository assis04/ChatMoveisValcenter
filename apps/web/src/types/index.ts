// ─── Tenant ────────────────────────────────────────────────────
export interface Tenant {
  id: string;
  name: string;
  chatwoot_account_id: number;
  plan: "starter" | "pro" | "enterprise";
  created_at: string;
}

// ─── User Profile ──────────────────────────────────────────────
export interface UserProfile {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: "owner" | "admin" | "manager" | "agent";
  chatwoot_user_id: number | null;
  created_at: string;
}

// ─── Kanban (Module 2) ────────────────────────────────────────
export interface Pipeline {
  id: string;
  tenant_id: string;
  name: string;
  position: number;
}

export interface KanbanStage {
  id: string;
  pipeline_id: string;
  name: string;
  color: string;
  position: number;
}

export interface KanbanCard {
  id: string;
  stage_id: string;
  conversation_id: number;
  contact_name: string;
  contact_phone: string;
  value: number | null;
  position: number;
  assigned_to: string | null;
  created_at: string;
}

// ─── Chatwoot Context (Dashboard App iframe) ──────────────────
export interface ChatwootDashboardContext {
  conversation?: {
    id: number;
    inbox_id: number;
    status: string;
    contact_id: number;
  };
  contact?: {
    id: number;
    name: string;
    email: string;
    phone_number: string;
  };
  currentAgent?: {
    id: number;
    name: string;
    email: string;
  };
}

// ─── WhatsApp Groups via Evolution API ────────────────────────
export interface EvolutionGroupParticipant {
  // `id` é o LID do WhatsApp (ex: "220843074404479@lid") — identificador
  // interno e anônimo, NÃO um telefone. Nunca formatar como número.
  id: string;
  // Telefone real ("5511987428238@s.whatsapp.net") que o Evolution resolve a
  // partir do LID. É o que exibimos e usamos nas ações. Pode faltar (raro).
  phoneNumber?: string | null;
  // pushName + foto do WhatsApp (vêm no /group/participants; nem sempre no
  // findGroupInfos). Bom fallback quando o número não é contato salvo.
  name?: string | null;
  imgUrl?: string | null;
  admin: "superadmin" | "admin" | null;
}

export interface EvolutionGroup {
  id: string; // <jid>@g.us
  subject: string;
  subjectOwner?: string;
  subjectTime?: number;
  pictureUrl?: string | null;
  size?: number;
  creation?: number;
  owner?: string;
  desc?: string;
  descId?: string;
  restrict?: boolean;
  announce?: boolean;
  isCommunity?: boolean;
  isCommunityAnnounce?: boolean;
  participants?: EvolutionGroupParticipant[];
}

export type ParticipantAction = "add" | "remove" | "promote" | "demote";

// ─── Modelos de grupo (time padrão + nome-base) ───────────────
export interface GroupTemplateParticipant {
  name: string;
  phone_number: string;
}

export interface GroupTemplate {
  id: string;
  name: string;
  group_name_base: string;
  description: string;
  participants: GroupTemplateParticipant[];
  announce: boolean;
  restrict: boolean;
  created_at: string;
  updated_at: string;
}

// Mapping resolved from Chatwoot inboxes ↔ Evolution instances.
// Chatwoot.nameInbox on the Evolution instance is the join key.
export interface InboxInstanceMapping {
  inbox_id: number;
  inbox_name: string;
  instance_name: string;
  instance_id: string;
  connection_status: "open" | "close" | "connecting" | string;
}

// ─── Spike "visto por agente" ─────────────────────────────────
export interface ConversationSeenEntry {
  agent_id: number;
  agent_name: string;
  last_seen_at: string;
}

export interface UnseenConversation {
  id: number;
  inbox_id: number;
  status: string;
  last_activity_at: number; // epoch seconds
  contact_name: string;
  last_message: string;
}
