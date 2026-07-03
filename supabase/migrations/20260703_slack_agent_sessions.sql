create table if not exists public.slack_agent_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  slack_team_id text not null,
  slack_user_id text not null,
  slack_channel_id text not null,
  thread_ts text,
  flow_type text not null default 'prep',
  step text not null,
  status text not null default 'active',
  answers jsonb not null default '{}'::jsonb,
  evidence_suggestions jsonb not null default '[]'::jsonb,
  confirmed_evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists slack_agent_sessions_active_lookup_idx
  on public.slack_agent_sessions (slack_team_id, slack_user_id, slack_channel_id, updated_at desc)
  where status = 'active';

create index if not exists slack_agent_sessions_user_created_idx
  on public.slack_agent_sessions (user_id, created_at desc);

create index if not exists slack_agent_sessions_expiry_idx
  on public.slack_agent_sessions (expires_at)
  where status = 'active';

alter table public.slack_agent_sessions enable row level security;
