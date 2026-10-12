-- The daily retention purge deletes receipt scans that were never committed to an expense once
-- they are a year old (services/worker/src/jobs/money/index.ts), as `app_system`, which until now
-- could only read, add and update them: every purge failed on this table. `app_user` keeps no
-- delete path.

GRANT DELETE ON receipts TO app_system;
