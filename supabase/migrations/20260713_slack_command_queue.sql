create table if not exists public.slack_command_lanes (
  slack_team_id text not null,
  slack_user_id text not null,
  next_available_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (slack_team_id, slack_user_id),
  check (btrim(slack_team_id) <> ''),
  check (btrim(slack_user_id) <> '')
);

create table if not exists public.slack_command_jobs (
  id uuid primary key default gen_random_uuid(),
  request_key text not null unique,
  slack_team_id text not null,
  slack_user_id text not null,
  intent text not null check (intent in ('decode', 'respond', 'rewrite', 'prep', 'practice')),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  scheduled_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (btrim(request_key) <> ''),
  check (btrim(slack_team_id) <> ''),
  check (btrim(slack_user_id) <> '')
);

create index if not exists slack_command_jobs_user_schedule_idx
  on public.slack_command_jobs (slack_team_id, slack_user_id, scheduled_at desc);

create index if not exists slack_command_jobs_unfinished_idx
  on public.slack_command_jobs (status, scheduled_at)
  where status in ('queued', 'processing');

alter table public.slack_command_lanes enable row level security;
alter table public.slack_command_jobs enable row level security;

revoke all on table public.slack_command_lanes from public, anon, authenticated;
revoke all on table public.slack_command_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.slack_command_lanes to service_role;
grant select, insert, update, delete on table public.slack_command_jobs to service_role;

create or replace function public.reserve_slack_command_job(
  p_request_key text,
  p_slack_team_id text,
  p_slack_user_id text,
  p_intent text,
  p_spacing_ms integer default 4000
)
returns table (
  job_id uuid,
  scheduled_at timestamptz,
  is_duplicate boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job_id uuid;
  v_scheduled_at timestamptz;
  v_now timestamptz := clock_timestamp();
  v_spacing interval;
begin
  if nullif(btrim(p_request_key), '') is null
    or nullif(btrim(p_slack_team_id), '') is null
    or nullif(btrim(p_slack_user_id), '') is null then
    raise exception 'Slack command reservation requires a request key, team ID, and user ID';
  end if;

  if p_intent not in ('decode', 'respond', 'rewrite', 'prep', 'practice') then
    raise exception 'Unsupported Slack command intent: %', p_intent;
  end if;

  v_spacing := make_interval(secs => least(greatest(coalesce(p_spacing_ms, 4000), 1000), 15000)::double precision / 1000.0);

  -- The transaction-level lock is held only for this short reservation. It makes
  -- reservations atomic even when Vercel handles button presses on different instances.
  perform pg_advisory_xact_lock(
    hashtextextended(p_slack_team_id || chr(31) || p_slack_user_id, 0)
  );

  select jobs.id, jobs.scheduled_at
    into v_job_id, v_scheduled_at
  from public.slack_command_jobs as jobs
  where jobs.request_key = p_request_key;

  if found then
    return query select v_job_id, v_scheduled_at, true;
    return;
  end if;

  select greatest(lanes.next_available_at, v_now)
    into v_scheduled_at
  from public.slack_command_lanes as lanes
  where lanes.slack_team_id = p_slack_team_id
    and lanes.slack_user_id = p_slack_user_id;

  if not found then
    v_scheduled_at := v_now;
  end if;

  insert into public.slack_command_lanes (
    slack_team_id,
    slack_user_id,
    next_available_at,
    updated_at
  ) values (
    p_slack_team_id,
    p_slack_user_id,
    v_scheduled_at + v_spacing,
    v_now
  )
  on conflict (slack_team_id, slack_user_id) do update
    set next_available_at = excluded.next_available_at,
        updated_at = excluded.updated_at;

  insert into public.slack_command_jobs (
    request_key,
    slack_team_id,
    slack_user_id,
    intent,
    scheduled_at
  ) values (
    p_request_key,
    p_slack_team_id,
    p_slack_user_id,
    p_intent,
    v_scheduled_at
  )
  returning id into v_job_id;

  return query select v_job_id, v_scheduled_at, false;
end;
$$;

revoke all on function public.reserve_slack_command_job(text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_slack_command_job(text, text, text, text, integer)
  to service_role;

comment on table public.slack_command_lanes is
  'Service-role-only scheduling lanes that serialize Beckett Slack commands per workspace user.';
comment on table public.slack_command_jobs is
  'Service-role-only status records for durable Beckett Slack command processing.';
comment on function public.reserve_slack_command_job(text, text, text, text, integer) is
  'Atomically reserves an ordered Slack command slot and deduplicates Slack retries.';
