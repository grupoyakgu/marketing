alter table marketing_plan add column if not exists image_urls text[];

notify pgrst, 'reload schema';
