-- The recap in each reader's language, and narration the crew owns (docs/data-model.md §3.10, doc
-- deltas): `recaps.i18n` and `recap_awards.i18n` hold the guide-text translations of the card copy
-- and of each award's words (`@cp/domain` guide-text kinds `recap` and `recap_award`), written by
-- `guide_text.translate` like every other guide line. Recap narration is trip media rather than any
-- one traveller's: its `media_objects` row has no owner (`t/<trip>/recap_audio/<id>` keys), so
-- purging an account never takes the crew's narration with it.
ALTER TABLE recaps ADD COLUMN i18n jsonb CHECK (i18n IS NULL OR jsonb_typeof(i18n) = 'object');
ALTER TABLE recap_awards ADD COLUMN i18n jsonb
  CHECK (i18n IS NULL OR jsonb_typeof(i18n) = 'object');

ALTER TABLE media_objects ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE media_objects ADD CONSTRAINT media_objects_owner_check
  CHECK (owner_id IS NOT NULL OR (trip_id IS NOT NULL AND purpose = 'recap_audio'));
CREATE UNIQUE INDEX media_objects_trip_owned_key_idx ON media_objects (r2_key)
  WHERE owner_id IS NULL;
