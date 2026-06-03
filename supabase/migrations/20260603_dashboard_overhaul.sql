-- Run this in the Supabase SQL editor

-- trusted_people
create table if not exists public.trusted_people (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  relationship text,
  communication_style text,
  notes text,
  created_at timestamptz default now()
);
alter table public.trusted_people enable row level security;
create policy "Users can manage own trusted people"
  on public.trusted_people for all using (auth.uid() = user_id);

-- practice_sessions
create table if not exists public.practice_sessions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  skill_id text,
  person text,
  situation text,
  goal text,
  created_at timestamptz default now()
);
alter table public.practice_sessions enable row level security;
create policy "Users can manage own sessions"
  on public.practice_sessions for all using (auth.uid() = user_id);

-- daily_checkins
create table if not exists public.daily_checkins (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  mood text not null,
  date date not null default current_date,
  unique(user_id, date)
);
alter table public.daily_checkins enable row level security;
create policy "Users can manage own checkins"
  on public.daily_checkins for all using (auth.uid() = user_id);

-- user_about
create table if not exists public.user_about (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  communication_style text,
  triggers text,
  how_i_work_best text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.user_about enable row level security;
create policy "Users can manage own about"
  on public.user_about for all using (auth.uid() = user_id);
