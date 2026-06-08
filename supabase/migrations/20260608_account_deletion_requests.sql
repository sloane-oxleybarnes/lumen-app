-- Beta account deletion request workflow

alter table public.profiles
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_status text,
  add column if not exists deletion_notes text;
