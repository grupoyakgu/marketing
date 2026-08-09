-- pepe_consultations (20260809_pepe_consultations.sql) and angeles_followups
-- (20260809150800_angeles_followups.sql) were superseded by the generic
-- bot_consultations/bot_followups pair (20260809180000_bot_consultations.sql)
-- -- nothing in the codebase references either table anymore. Left in place
-- at the time as a non-destructive default; now dropped on request since
-- they were confirmed orphaned (a handful of stale queue rows, no data of
-- lasting value).

drop table if exists pepe_consultations;
drop table if exists angeles_followups;

notify pgrst, 'reload schema';
