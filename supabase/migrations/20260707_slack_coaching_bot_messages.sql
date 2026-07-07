create table if not exists public.slack_coaching_bot_messages (
  id uuid primary key default gen_random_uuid(),
  coaching_thread_id uuid references public.slack_coaching_threads(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  slack_channel_id text not null,
  slack_message_ts text not null,
  kind text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (coaching_thread_id, slack_channel_id, slack_message_ts)
);

create index if not exists slack_coaching_bot_messages_thread_idx
  on public.slack_coaching_bot_messages (coaching_thread_id, created_at asc);

alter table public.slack_coaching_bot_messages enable row level security;

create policy "Users can manage own Slack coaching bot messages"
  on public.slack_coaching_bot_messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
