-- A booking that leaves the wallet (deleted, cancelled, or taken back from the crew) takes its
-- anchored item off the organiser's draft, which the server brings in line in place. Until now the
-- server only ever added and updated plan rows. The plan the crew reads still changes only through
-- a new version, and `app_user` keeps no write path to plan rows.

GRANT DELETE ON plan_items TO app_system;
