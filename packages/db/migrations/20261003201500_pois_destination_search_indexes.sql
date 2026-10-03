-- migrate:no-transaction
-- Place search scoped to one destination (docs/data-model.md §3.13 `pois`).
--
-- With millions of rows, the global `fts` and trigram GIN indexes gathered candidates across every
-- destination and filtered by destination afterwards, reading a heap page per candidate. A GIN
-- index over (destination_id, fts) and (destination_id, name gin_trgm_ops) (`btree_gin` makes the
-- uuid indexable in GIN) intersects the destination with the text match inside the index, so a
-- search reads only that destination's candidates. A multicolumn GIN index serves a condition on
-- any subset of its columns just as well, so these replace the global indexes for searches without
-- a destination too, and the ingest keeps paying for two text indexes, not four.
--
-- The no-query browse orders a destination's quality rows by editorial, quality score and name. The
-- partial expression index below holds exactly that order, so a browse reads its first page
-- instead of scoring and sorting every row of a large destination. Its expressions and predicate
-- must stay textually identical to `services/api/src/places/search.ts` (`LOW_QUALITY`,
-- `QUALITY_SCORE`), or the planner stops using it.
--
-- Built CONCURRENTLY, outside a transaction, so the place ingest keeps writing while they build;
-- every statement is idempotent so a failed run can simply be retried.
CREATE EXTENSION IF NOT EXISTS btree_gin WITH SCHEMA public;

CREATE INDEX CONCURRENTLY IF NOT EXISTS pois_destination_fts_idx ON pois USING gin (destination_id, fts);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pois_destination_name_trgm_idx ON pois USING gin (destination_id, name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS pois_destination_browse_idx ON pois (
  destination_id,
  (curation = 'editorial') DESC,
  ((source_ids ? 'fsq_os')::int + (source_ids ? 'fsq_os' AND source_ids ? 'overture')::int
    + (category <> 'other')::int + coalesce(confidence, 0.5)) DESC,
  name
) WHERE status = 'active' AND merged_into_id IS NULL
  AND NOT (curation <> 'editorial' AND NOT (source_ids ? 'fsq_os') AND coalesce(confidence < 0.5, false));

DROP INDEX CONCURRENTLY IF EXISTS pois_fts_idx;
DROP INDEX CONCURRENTLY IF EXISTS pois_name_trgm_idx;
