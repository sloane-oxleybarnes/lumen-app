-- Beta onboarding and coaching preferences

alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists display_name text,
  add column if not exists strengths text[] default '{}',
  add column if not exists workplace_triggers text[] default '{}',
  add column if not exists communication_preferences text[] default '{}',
  add column if not exists coaching_tone text not null default 'direct_kind',
  add column if not exists neurodivergent_context text[] default '{}',
  add column if not exists neurodivergent_context_other text,
  add column if not exists first_login_complete boolean not null default false,
  add column if not exists onboarding_completed_at timestamptz;
