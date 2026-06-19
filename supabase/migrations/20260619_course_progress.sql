create table if not exists public.course_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  course_id text not null,
  phase text not null,
  current_slide_index int not null default 0,
  pre_confidence int check (pre_confidence between 1 and 5),
  progress_percent int not null default 0 check (progress_percent between 0 and 100),
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, course_id)
);

alter table public.course_progress enable row level security;

create policy "Users can manage own course progress"
  on public.course_progress
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists course_progress_user_saved_at_idx
  on public.course_progress(user_id, saved_at desc);
