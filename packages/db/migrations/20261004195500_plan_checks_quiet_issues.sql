-- Issues the organiser chose to keep as they are (docs/api-contracts-planning.md, plan check).
--
-- `plan_checks.quiet` lists them per trip: each mark names the issue (its kind and the stops,
-- booking or day it is about), the stops around it when it was set, who set it and when. The plan
-- check job leaves a marked issue out of its list and its counts while those neighbours stay the
-- same, and drops the mark when they change. `keep_check_issue` adds a mark; the job prunes them.
--
-- plan_checks stays C1 (ids and numbers only) under the policies and grants it already has: the
-- trip's crew reads the row, only app_system writes it. It is already in the powersync publication.
ALTER TABLE plan_checks
  ADD COLUMN quiet jsonb NOT NULL DEFAULT '[]'::jsonb
  CONSTRAINT plan_checks_quiet_check CHECK (jsonb_typeof(quiet) = 'array');
