-- What a place profile was made from. `web`: the `places.profile` job's run over web pages (text,
-- facts, photos and typed fields). `reviewed_note`: typed fields only (best times, visit length,
-- meal role, dish), labelled from the place's reviewed editors' note (`pois.editorial`), which keeps
-- the prose: such a row has no texts, facts or photos, and the note is what a reader sees.
ALTER TABLE place_profiles
  ADD COLUMN basis text NOT NULL DEFAULT 'web' CHECK (basis IN ('web', 'reviewed_note'));
