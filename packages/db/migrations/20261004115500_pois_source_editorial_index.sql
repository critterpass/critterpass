-- migrate:no-transaction
-- An editorial place (a landmark made from a Wikidata item, such as Mỹ Sơn) is found by its
-- `source_ids.editorial` key when a places or media release is published. The other source keys
-- have a partial unique index each; without one here, every such lookup read all of `pois`.
--
-- Built CONCURRENTLY, outside a transaction, so the place ingest keeps writing while it builds;
-- idempotent, so a failed run can simply be retried.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS pois_source_editorial_uidx
  ON pois (((source_ids ->> 'editorial'))) WHERE source_ids ? 'editorial';
