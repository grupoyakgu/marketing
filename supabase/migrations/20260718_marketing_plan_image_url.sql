alter table marketing_plan add column if not exists image_url text;

notify pgrst, 'reload schema';
