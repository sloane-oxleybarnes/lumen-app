create table if not exists public.slack_guest_sessions (
  id uuid primary key default gen_random_uuid(),
  slack_team_id text not null,
  slack_user_id text not null,
  assistant_channel_id text not null,
  assistant_thread_ts text not null,
  flow_type text not null check (flow_type in ('decode', 'respond', 'rewrite', 'prep', 'practice', 'retrieval')),
  source jsonb not null default '{}'::jsonb,
  state jsonb not null default '{}'::jsonb,
  artifacts jsonb not null default '{}'::jsonb,
  transcript jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  practice_thread_ts text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (slack_team_id, slack_user_id, assistant_channel_id, assistant_thread_ts)
);

create index if not exists slack_guest_sessions_lookup_idx
  on public.slack_guest_sessions (slack_team_id, slack_user_id, assistant_channel_id, assistant_thread_ts);

create index if not exists slack_guest_sessions_expiry_idx
  on public.slack_guest_sessions (expires_at)
  where status = 'active';

alter table public.slack_guest_sessions enable row level security;
