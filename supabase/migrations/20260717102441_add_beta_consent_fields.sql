-- Record explicit beta eligibility and legal acknowledgements on the user's profile.
-- Timestamps provide an audit date; versions identify the exact copy accepted.

alter table public.profiles
  add column if not exists adult_us_eligibility_confirmed_at timestamptz,
  add column if not exists adult_us_eligibility_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists privacy_acknowledged_at timestamptz,
  add column if not exists privacy_version text,
  add column if not exists coaching_disclaimer_acknowledged_at timestamptz,
  add column if not exists coaching_disclaimer_version text;
