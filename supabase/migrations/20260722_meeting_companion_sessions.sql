-- Meeting Companion stores only user-controlled notes and final outputs.
-- Raw audio and raw transcripts are intentionally not represented in this schema.

create table if not exists public.meeting_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source text not null default 'manual' check (source in ('manual', 'calendar', 'desktop_companion')),
  scheduled_at timestamptz,
  user_notes text,
  final_summary text,
  decisions jsonb not null default '[]'::jsonb,
  open_questions jsonb not null default '[]'::jsonb,
  follow_up_draft text,
  retention_preference text not null default 'summary_only' check (retention_preference in ('do_not_save', 'notes_only', 'summary_only')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meeting_sessions_user_updated_idx
  on public.meeting_sessions (user_id, updated_at desc);

grant select, insert, update, delete on public.meeting_sessions to authenticated;
alter table public.meeting_sessions enable row level security;

create policy "Users can read their own meeting sessions"
  on public.meeting_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can insert their own meeting sessions"
  on public.meeting_sessions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users can update their own meeting sessions"
  on public.meeting_sessions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own meeting sessions"
  on public.meeting_sessions for delete to authenticated
  using ((select auth.uid()) = user_id);
