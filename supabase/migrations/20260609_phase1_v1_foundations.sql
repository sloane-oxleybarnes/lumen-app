-- Phase 1: quiet V1 foundations.
-- These structures are intentionally backend-ready and hidden from beta UI.

create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, enabled, description)
values
  ('inline_editor', false, 'Inline Gmail/Slack editor suggestions.'),
  ('meeting_guidance', false, 'Google Meet and Zoom live coaching.'),
  ('calendar_prep', false, 'Calendar-aware meeting preparation.'),
  ('relationship_memory', false, 'Cross-platform relationship memory and contact summaries.'),
  ('personal_expansion', false, 'Personal-mode mobile/text/dating expansion.'),
  ('regulation_dashboard', false, 'Workday regulation and productivity dashboard.'),
  ('proactive_coaching', false, 'Opt-in proactive coaching prompts.')
on conflict (key) do nothing;

alter table public.feature_flags enable row level security;

create policy "Feature flags are readable by authenticated users"
  on public.feature_flags for select
  using (auth.uid() is not null);

alter table public.profiles
  add column if not exists proactive_coaching_preference text not null default 'wait_until_asked'
    check (proactive_coaching_preference in ('wait_until_asked', 'quiet_prompt', 'direct_interrupt')),
  add column if not exists pattern_model_enabled boolean not null default false;

create table if not exists public.contact_relationship_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  contact_id uuid references public.contacts(id) on delete cascade not null,
  communication_style text,
  recurring_tension_points text,
  what_tends_to_work text,
  unresolved_topics text,
  last_interaction_at timestamptz,
  generated_from text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, contact_id)
);

alter table public.contact_relationship_summaries enable row level security;

create policy "Users manage own relationship summaries"
  on public.contact_relationship_summaries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.interaction_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  contact_id uuid references public.contacts(id) on delete set null,
  platform text,
  interaction_type text,
  summary text not null,
  tone_observed text,
  user_response_pattern text,
  suggested_followup text,
  occurred_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.interaction_summaries enable row level security;

create policy "Users manage own interaction summaries"
  on public.interaction_summaries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.user_pattern_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  pattern_key text not null,
  label text not null,
  evidence_summary text,
  coaching_note text,
  confidence numeric(3,2) check (confidence >= 0 and confidence <= 1),
  source text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_pattern_observations enable row level security;

create policy "Users manage own pattern observations"
  on public.user_pattern_observations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists contact_relationship_summaries_user_idx
  on public.contact_relationship_summaries (user_id, updated_at desc);

create index if not exists interaction_summaries_user_created_idx
  on public.interaction_summaries (user_id, created_at desc);

create index if not exists interaction_summaries_contact_idx
  on public.interaction_summaries (contact_id, created_at desc);

create index if not exists user_pattern_observations_user_key_idx
  on public.user_pattern_observations (user_id, pattern_key, archived_at);
