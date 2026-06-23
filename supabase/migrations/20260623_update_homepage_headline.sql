insert into public.site_content (key, value, label, section, input_type, updated_at)
values (
  'home.hero.title',
  'Neurodivergent communication coaching
for the conversations that matter most at work.',
  'Homepage headline',
  'Homepage',
  'textarea',
  now()
)
on conflict (key) do update
set
  value = excluded.value,
  label = excluded.label,
  section = excluded.section,
  input_type = excluded.input_type,
  updated_at = now();
