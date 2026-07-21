-- Modelos de grupo (Pacote 2): time padrão + nome-base reutilizáveis.
-- Aplicar no painel do Supabase (SQL editor) ou via `supabase db push`.

create table if not exists public.group_templates (
  id uuid primary key default gen_random_uuid(),
  account_id integer not null default 1,
  name text not null,
  group_name_base text not null default '',
  description text not null default '',
  participants jsonb not null default '[]'::jsonb, -- [{ name, phone_number }]
  announce boolean not null default false,
  restrict boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists group_templates_account_idx
  on public.group_templates (account_id);

-- RLS ligado, sem policies: só a service role key (servidor) acessa; a anon
-- key (navegador) fica bloqueada. Defesa em profundidade.
alter table public.group_templates enable row level security;

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists group_templates_set_updated_at on public.group_templates;
create trigger group_templates_set_updated_at
  before update on public.group_templates
  for each row execute function public.set_updated_at();
