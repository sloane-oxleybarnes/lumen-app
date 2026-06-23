create table if not exists public.slack_pending_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  slack_team_id text not null,
  slack_user_id text not null,
  slack_channel_id text,
  slack_channel_name text,
  prompt text not null,
  response_url text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  completed_at timestamptz
);

create index if not exists slack_pending_requests_user_created_idx
  on public.slack_pending_requests (user_id, created_at desc);

create index if not exists slack_pending_requests_slack_lookup_idx
  on public.slack_pending_requests (slack_team_id, slack_user_id, created_at desc);

create index if not exists slack_pending_requests_expiry_idx
  on public.slack_pending_requests (expires_at)
  where completed_at is null;

alter table public.slack_pending_requests enable row level security;
