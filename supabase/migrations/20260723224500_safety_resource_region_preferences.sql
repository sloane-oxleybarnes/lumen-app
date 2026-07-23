alter table public.profiles
  add column if not exists safety_resource_region text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_safety_resource_region_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_safety_resource_region_check
      check (safety_resource_region is null or safety_resource_region in ('US', 'CA', 'GB', 'AU', 'OTHER'));
  end if;
end $$;
