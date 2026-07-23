-- OAuth credentials are server-only. Browser clients may read integration status,
-- but may never select the encrypted credential column.
revoke select on table public.user_integrations from anon, authenticated;

grant select (
  id,
  user_id,
  provider,
  external_user_id,
  external_team_id,
  external_team_name,
  metadata,
  connected_at,
  updated_at
) on table public.user_integrations to authenticated;
