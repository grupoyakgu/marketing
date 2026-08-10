-- Two posts were manually published on 2026-08-10 and then logged in the
-- planner retroactively. They are already live and must not be reposted.
-- This flips them from 'approved' to 'posted' so the hourly cron ignores them.
update marketing_plan
set status = 'posted'
where id in (
  '7d9325fa-5783-481c-b738-bf9a68f20ffc', -- Instagram, 17:45
  '5edd0b24-6846-45da-ba4a-54ebbc20e78c'  -- Facebook, 17:50
)
and status = 'approved'; -- guard: only flip if still approved, never touch an already-posted row
