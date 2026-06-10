-- Phase 2: beta instrumentation and business-system readiness.
-- Adds a durable event ledger for funnel tracking without making vendor tools
-- the source of truth.

alter table public.beta_signups
  add column if not exists lifecycle_stage text not null default 'requested_access',
  add column if not exists approved_at timestamptz,
  add column if not exists invite_sent_at timestamptz,
  add column if not exists invite_reminder_sent_at timestamptz,
  add column if not exists last_activity_at timestamptz;

create table if not exists public.beta_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  event_name text not null,
  source text not null default 'app',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists beta_events_user_created_idx
  on public.beta_events (user_id, created_at desc);

create index if not exists beta_events_email_created_idx
  on public.beta_events (lower(email), created_at desc);

create index if not exists beta_events_name_created_idx
  on public.beta_events (event_name, created_at desc);

alter table public.beta_events enable row level security;

create policy "Users can view own beta events"
  on public.beta_events for select
  using (auth.uid() = user_id);
