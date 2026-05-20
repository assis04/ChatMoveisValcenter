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
