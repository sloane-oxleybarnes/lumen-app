alter table public.beta_mission_assignments
  add column if not exists presented_at timestamptz;
