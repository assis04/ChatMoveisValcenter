-- Spike "visto por agente" (per-agent read): rastreia quando cada agente viu
-- cada conversa, SEM tocar no core do Chatwoot. Aplicar no SQL Editor do Supabase.

create table if not exists public.conversation_seen (
  account_id integer not null default 1,
  conversation_id integer not null,
  agent_id integer not null,
  agent_name text not null default '',
  last_seen_at timestamptz not null default now(),
  primary key (account_id, conversation_id, agent_id)
);

-- Consulta "quem viu esta conversa" (painel) e "o que este agente viu" (lista).
create index if not exists conversation_seen_by_conversation_idx
  on public.conversation_seen (account_id, conversation_id);
create index if not exists conversation_seen_by_agent_idx
  on public.conversation_seen (account_id, agent_id);

-- RLS on, sem policies: só a service role key (servidor) acessa.
alter table public.conversation_seen enable row level security;
