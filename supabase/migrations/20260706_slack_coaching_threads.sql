create table if not exists public.slack_coaching_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  slack_team_id text not null,
  slack_user_id text not null,
  slack_channel_id text,
  thread_ts text,
  source_channel_id text,
  source_channel_name text,
  flow_type text not null,
  title text not null,
  summary text,
  prompt_snippet text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists slack_coaching_threads_user_recent_idx
  on public.slack_coaching_threads (user_id, updated_at desc)
  where archived_at is null;

create index if not exists slack_coaching_threads_slack_lookup_idx
  on public.slack_coaching_threads (slack_team_id, slack_user_id, updated_at desc)
  where archived_at is null;

alter table public.slack_coaching_threads enable row level security;

alter table public.slack_agent_sessions
  add column if not exists coaching_thread_id uuid references public.slack_coaching_threads(id) on delete set null;

create index if not exists slack_agent_sessions_coaching_thread_idx
  on public.slack_agent_sessions (coaching_thread_id);
