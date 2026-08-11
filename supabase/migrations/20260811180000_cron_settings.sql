-- Lets the dashboard show every Vercel cron (name, schedule, what it does)
-- and toggle each on/off. Vercel itself has no API to disable an individual
-- cron at runtime -- the schedule in vercel.json always fires -- so `enabled`
-- is instead checked by each cron route itself at the top of its handler,
-- which no-ops (without doing any real work) when disabled.

create table if not exists cron_settings (
  id text primary key,
  path text not null unique,
  name text not null,
  schedule text not null,
  description text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into cron_settings (id, path, name, schedule, description) values
  ('post-schedule', '/api/cron/post-schedule', 'Post Schedule', '0 * * * *', 'Publishes any approved post whose scheduled time has passed.'),
  ('weekly-plan', '/api/cron/weekly-plan', 'Weekly Plan', '0 7 * * 5', 'Asks Pepe to draft and save next week''s 10-post marketing plan.'),
  ('check-comments', '/api/cron/check-comments', 'Check Comments', '0 10 * * *', 'Checks for new comments on published posts and has Pepe reply.'),
  ('weekly-engagement', '/api/cron/weekly-engagement', 'Weekly Engagement', '0 13 * * 5', 'Refreshes engagement stats and account follower snapshots, reports to Pepe''s chat.'),
  ('refresh-dashboard-data', '/api/cron/refresh-dashboard-data', 'Refresh Dashboard Data', '0 5 * * *', 'Refreshes follower and post engagement data shown on the dashboard.'),
  ('refresh-hashtags', '/api/cron/refresh-hashtags', 'Refresh Hashtags', '0 6 * * 1', 'Refreshes cached stats for tracked Instagram hashtags.'),
  ('refresh-interactions', '/api/cron/refresh-interactions', 'Refresh Interactions', '0 8 * * *', 'Tops up each platform''s Interactions pool toward its daily target.'),
  ('process-video-jobs', '/api/cron/process-video-jobs', 'Process Video Jobs', '*/5 * * * *', 'Checks pending HeyGen video jobs and auto-posts finished ones.'),
  ('process-santi-delegations', '/api/cron/process-santi-delegations', 'Process Santi Delegations', '*/5 * * * *', 'Drains queued delegations from Angeles to Santi.'),
  ('process-bot-consultations', '/api/cron/process-bot-consultations', 'Process Bot Consultations', '*/5 * * * *', 'Drains queued cross-bot consultation requests.'),
  ('process-bot-followups', '/api/cron/process-bot-followups', 'Process Bot Followups', '*/5 * * * *', 'Drains queued follow-up messages between bots.'),
  ('process-interaction-fetches', '/api/cron/process-interaction-fetches', 'Process Interaction Fetches', '*/5 * * * *', 'Drains the queue of "find one more post" requests for Interactions, fulfilled by Pepe.')
on conflict (id) do nothing;

notify pgrst, 'reload schema';
