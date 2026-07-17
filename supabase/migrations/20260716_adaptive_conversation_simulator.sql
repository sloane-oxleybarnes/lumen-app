-- Adaptive Conversation Simulator sessions are intentionally separate from
-- the existing Practice tables and behavior.
create table if not exists public.adaptive_conversation_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  contact_id uuid references public.contacts(id) on delete set null,
  scenario_type text not null check (scenario_type in ('general', 'contact')),
  difficulty text not null default 'realistic' check (difficulty = 'realistic'),
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  lifecycle text not null default 'ready' check (lifecycle in ('setup', 'ready', 'responding', 'paused', 'help', 'completed', 'abandoned')),
  setup_snapshot jsonb not null default '{}'::jsonb,
  simulation_state jsonb not null default '{}'::jsonb,
  transcript jsonb not null default '[]'::jsonb,
  assessment jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists adaptive_conversation_sessions_user_updated_idx
  on public.adaptive_conversation_sessions (user_id, updated_at desc);

alter table public.adaptive_conversation_sessions
  add column if not exists lifecycle text not null default 'ready';

alter table public.adaptive_conversation_sessions enable row level security;

drop policy if exists "Users manage own adaptive simulator sessions"
  on public.adaptive_conversation_sessions;
create policy "Users manage own adaptive simulator sessions"
  on public.adaptive_conversation_sessions for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.adaptive_conversation_sessions from anon;
grant select, insert, update, delete on table public.adaptive_conversation_sessions to authenticated;
