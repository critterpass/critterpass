-- hazard_alerts sources (docs/data-model.md): the Smithsonian GVP weekly report refuses the
-- worker's datacenter traffic, so it gives way to CENAPRED (Popocatépetl's alert light) and GDACS
-- volcano events (the worldwide fallback). Readings from the retired feed are cached copies of a
-- public report, so they are dropped rather than relabelled; the list mirrors
-- packages/domain/src/travel-data/types.ts#HAZARD_SOURCES.

DELETE FROM hazard_alerts WHERE source = 'gvp';
ALTER TABLE hazard_alerts DROP CONSTRAINT hazard_alerts_source_check;
ALTER TABLE hazard_alerts ADD CONSTRAINT hazard_alerts_source_check
  CHECK (source IN ('magma', 'imo', 'jma', 'cenapred', 'gdacs'));
