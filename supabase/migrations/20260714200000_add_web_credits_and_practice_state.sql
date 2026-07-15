create table if not exists public.web_credit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  action text not null,
  credits integer not null default 1 check (credits > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists web_credit_events_user_created_idx
  on public.web_credit_events (user_id, created_at desc);

alter table public.web_credit_events enable row level security;
drop policy if exists "Users can read own web credit events" on public.web_credit_events;
create policy "Users can read own web credit events"
  on public.web_credit_events for select
  using ((select auth.uid()) = user_id);

revoke all on table public.web_credit_events from anon;
grant select on table public.web_credit_events to authenticated;

create table if not exists public.web_course_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  period_start date not null,
  created_at timestamptz not null default now(),
  unique (user_id, course_id, period_start)
);

create index if not exists web_course_unlocks_user_period_idx
  on public.web_course_unlocks (user_id, period_start desc);

alter table public.web_course_unlocks enable row level security;
drop policy if exists "Users can read own course unlocks" on public.web_course_unlocks;
create policy "Users can read own course unlocks"
  on public.web_course_unlocks for select
  using ((select auth.uid()) = user_id);

revoke all on table public.web_course_unlocks from anon;
grant select on table public.web_course_unlocks to authenticated;

alter table public.practice_sessions
  add column if not exists status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  add column if not exists mode text,
  add column if not exists conversation_format text,
  add column if not exists text_sub_format text,
  add column if not exists session_data jsonb not null default '{}'::jsonb,
  add column if not exists debrief_summary jsonb,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz;

create index if not exists practice_sessions_user_status_updated_idx
  on public.practice_sessions (user_id, status, updated_at desc);

drop policy if exists "Users can manage own sessions" on public.practice_sessions;
create policy "Users can manage own sessions"
  on public.practice_sessions for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.practice_sessions to authenticated;
