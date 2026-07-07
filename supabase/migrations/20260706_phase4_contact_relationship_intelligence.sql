-- Phase 4: Contact and relationship intelligence.
-- Adds enough metadata to distinguish confirmed channel identities from display-name fallbacks.

alter table public.contact_identifiers
  add column if not exists label text,
  add column if not exists confirmed boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists contact_identifiers_contact_idx
  on public.contact_identifiers (contact_id);

create index if not exists contact_identifiers_user_contact_idx
  on public.contact_identifiers (user_id, contact_id);

update public.contact_identifiers
set confirmed = true
where platform in ('email', 'work_email', 'personal_email', 'phone', 'mobile', 'slack_user_id')
  and confirmed = false;
