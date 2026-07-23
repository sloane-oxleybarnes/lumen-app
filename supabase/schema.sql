-- ============================================================
-- Lumen Supabase schema
-- Run this in the Supabase SQL editor before deploying
-- ============================================================

-- Teams table (referenced by profiles)
create table public.teams (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  plan text not null default 'team',
  seat_count integer not null default 5,
  admin_id uuid references auth.users(id),
  stripe_subscription_id text,
  hubspot_deal_id text,
  created_at timestamptz default now()
);

-- Users table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) primary key,
  email text not null,
  full_name text,
  plan text not null default 'free', -- 'free' | 'pro' | 'team' | 'beta'
  role text not null default 'member', -- 'member' | 'admin'
  team_id uuid references public.teams(id),
  team_opt_in boolean default false,
  hubspot_contact_id text,
  stripe_customer_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Beta signups (pre-auth leads)
create table public.beta_signups (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  name text,
  source text,
  plan text default 'beta',
  hubspot_contact_id text,
  converted_to_user boolean default false,
  created_at timestamptz default now()
);

-- Upgrade intents (Stripe stub)
create table public.upgrade_intents (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  email text not null,
  target_plan text not null,
  created_at timestamptz default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.beta_signups enable row level security;
alter table public.upgrade_intents enable row level security;

-- Profiles: users can only read/write their own
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Teams: members can view their own team
create policy "Team members can view their team"
  on public.teams for select
  using (
    id in (
      select team_id from public.profiles where id = auth.uid()
    )
  );

-- Upgrade intents: users can insert their own
create policy "Users can insert upgrade intents"
  on public.upgrade_intents for insert
  with check (auth.uid() = user_id);

-- ============================================================
-- Trigger: create profile on signup
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
set search_path = ''
as $$
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

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
