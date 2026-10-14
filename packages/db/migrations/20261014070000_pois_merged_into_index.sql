-- migrate:no-transaction
-- `pois.merged_into_id` points at the place a duplicate was merged into. Deleting a place checks
-- that no row still points at it; without an index that check read all of `pois` for every
-- deleted row, so pruning the open-data index could never finish.
--
-- Built CONCURRENTLY, outside a transaction, so the place ingest keeps writing while it builds;
-- partial, since almost no row is merged; idempotent, so a failed run can simply be retried.
CREATE INDEX CONCURRENTLY IF NOT EXISTS pois_merged_into_id_idx
  ON pois (merged_into_id) WHERE merged_into_id IS NOT NULL;
