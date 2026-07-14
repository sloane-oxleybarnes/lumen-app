create table if not exists public.beta_mission_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_key text not null,
  position integer not null check (position >= 0),
  status text not null default 'active' check (status in ('active', 'completed', 'skipped')),
  completion_source text check (completion_source is null or completion_source in ('automatic', 'self_reported')),
  completed_at timestamptz,
  skipped_at timestamptz,
  skip_reason text,
  feedback_rating text check (feedback_rating is null or feedback_rating in ('helpful', 'not_helpful')),
  feedback_comment text,
  feedback_at timestamptz,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mission_key)
);

create index if not exists beta_mission_assignments_user_status_position_idx
  on public.beta_mission_assignments (user_id, status, position);

create index if not exists beta_mission_assignments_mission_status_idx
  on public.beta_mission_assignments (mission_key, status);

alter table public.beta_mission_assignments enable row level security;

revoke all on table public.beta_mission_assignments from anon;
grant select, insert, update on table public.beta_mission_assignments to authenticated;
grant all on table public.beta_mission_assignments to service_role;

drop policy if exists "Users can view own beta missions" on public.beta_mission_assignments;
create policy "Users can view own beta missions"
  on public.beta_mission_assignments
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create own beta missions" on public.beta_mission_assignments;
create policy "Users can create own beta missions"
  on public.beta_mission_assignments
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own beta missions" on public.beta_mission_assignments;
create policy "Users can update own beta missions"
  on public.beta_mission_assignments
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
