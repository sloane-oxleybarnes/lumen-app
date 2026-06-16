create table if not exists public.course_toolkit_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  course_id text not null,
  category text not null,
  label text not null,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

alter table public.course_toolkit_items enable row level security;

create policy "Users can view own toolkit items"
  on public.course_toolkit_items
  for select using (auth.uid() = user_id);

create policy "Users can insert own toolkit items"
  on public.course_toolkit_items
  for insert with check (auth.uid() = user_id);

create policy "Users can update own toolkit items"
  on public.course_toolkit_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists course_toolkit_items_user_course_idx
  on public.course_toolkit_items(user_id, course_id)
  where deleted_at is null;
