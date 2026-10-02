-- The guide's words on a disruption (title, summary) and a forecast watch row (title, detail) in
-- each reader's language, the way plan days, plan items, briefings, quests and pitches carry them
-- (packages/domain/src/locale/guide-text.ts): `{"<locale>": {"<field>": text | null}, "_src": hash
-- of the source fields}`. Written by the `guide_text.translate` sweep as app_system; both tables'
-- grants are table-wide, so readers see it exactly where they see the row and app_user cannot
-- write it. Both rows ride the trip stream with `SELECT *`.
ALTER TABLE disruptions ADD COLUMN i18n jsonb
  CONSTRAINT disruptions_i18n_check CHECK (i18n IS NULL OR jsonb_typeof(i18n) = 'object');
ALTER TABLE watch_items ADD COLUMN i18n jsonb
  CONSTRAINT watch_items_i18n_check CHECK (i18n IS NULL OR jsonb_typeof(i18n) = 'object');
