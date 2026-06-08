create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  source text not null default 'web',
  action text not null,
  token_estimate integer not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.ai_usage_events enable row level security;

create policy "Users can view own AI usage events"
  on public.ai_usage_events for select
  using (auth.uid() = user_id);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

