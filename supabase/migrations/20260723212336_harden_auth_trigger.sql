-- The signup trigger needs elevated privileges to create a profile, but it is
-- not an RPC endpoint. Lock its lookup path and revoke public execution.
alter function public.handle_new_user() set search_path = '';

revoke execute on function public.handle_new_user() from public, anon, authenticated;
