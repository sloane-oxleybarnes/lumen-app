-- Base tables required before the dated feature migrations.
-- This is intentionally idempotent so staging can be bootstrapped from
-- supabase/migrations without separately running supabase/schema.sql.

create extension if not exists "pgcrypto";

create table if not exists public.teams (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  plan text not null default 'team',
  seat_count integer not null default 5,
  admin_id uuid references auth.users(id),
  stripe_subscription_id text,
  hubspot_deal_id text,
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid references auth.users(id) primary key,
  email text not null,
  full_name text,
  plan text not null default 'free',
  role text not null default 'member',
  team_id uuid references public.teams(id),
  team_opt_in boolean default false,
  hubspot_contact_id text,
  stripe_customer_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.beta_signups (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  name text,
  source text,
  plan text default 'beta',
  hubspot_contact_id text,
  converted_to_user boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.upgrade_intents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  email text not null,
  target_plan text not null,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.beta_signups enable row level security;
alter table public.upgrade_intents enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can view own profile'
  ) then
    create policy "Users can view own profile"
      on public.profiles for select
      using (auth.uid() = id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can update own profile'
  ) then
    create policy "Users can update own profile"
      on public.profiles for update
      using (auth.uid() = id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can insert own profile'
  ) then
    create policy "Users can insert own profile"
      on public.profiles for insert
      with check (auth.uid() = id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'teams'
      and policyname = 'Team members can view their team'
  ) then
    create policy "Team members can view their team"
      on public.teams for select
      using (
        id in (
          select team_id from public.profiles where id = auth.uid()
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'upgrade_intents'
      and policyname = 'Users can insert upgrade intents'
  ) then
    create policy "Users can insert upgrade intents"
      on public.upgrade_intents for insert
      with check (auth.uid() = user_id);
  end if;
end
$$;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name'
  );
  return new;
end;
$$ language plpgsql security definer;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute procedure public.handle_new_user();
  end if;
end
$$;
