alter table public.course_progress
  add column if not exists activity_state jsonb;
