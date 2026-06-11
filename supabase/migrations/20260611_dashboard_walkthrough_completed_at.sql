alter table public.profiles
  add column if not exists dashboard_walkthrough_completed_at timestamptz;
