-- Phase 6: consent-first workday coaching foundations.
-- These tables contain only voluntary, structured check-ins and derived summaries.
-- They intentionally exclude message, calendar, and free-form work-history storage.

create table if not exists public.workday_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  time_of_day text not null check (time_of_day in ('morning', 'midday', 'afternoon', 'evening')),
  workload_level text not null check (workload_level in ('light', 'steady', 'stacked')),
  energy_level smallint not null check (energy_level between 1 and 5),
  communication_friction boolean not null default false,
  break_status text not null check (break_status in ('taken', 'not_taken', 'would_help')),
  helpful_strategy text not null check (helpful_strategy in ('quiet_block', 'written_next_steps', 'clearer_priority', 'short_break', 'draft_before_sending', 'none_yet')),
  created_at timestamptz not null default now()
);

create index if not exists workday_checkins_user_checked_in_idx
  on public.workday_checkins (user_id, checked_in_at desc);

create table if not exists public.workday_pattern_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('load', 'friction', 'break', 'strategy')),
  summary text not null,
  evidence jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists workday_pattern_summaries_user_generated_idx
  on public.workday_pattern_summaries (user_id, generated_at desc);

alter table public.workday_checkins enable row level security;
alter table public.workday_pattern_summaries enable row level security;

create policy "Users can read their own workday check-ins"
  on public.workday_checkins for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert their own workday check-ins"
  on public.workday_checkins for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own workday check-ins"
  on public.workday_checkins for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own workday check-ins"
  on public.workday_checkins for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their own workday summaries"
  on public.workday_pattern_summaries for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert their own workday summaries"
  on public.workday_pattern_summaries for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own workday summaries"
  on public.workday_pattern_summaries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own workday summaries"
  on public.workday_pattern_summaries for delete to authenticated
  using ((select auth.uid()) = user_id);
