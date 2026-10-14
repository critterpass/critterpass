-- Local tour guides: the guides and small guiding outfits travellers rate well in a destination,
-- found on the web by researchers and loaded from their files by the guides loader. Read by
-- `GET /v1/destinations/{id}/guides`.
--
-- local_guides: Authz "sys", RLS "R", privacy class C0. A row holds only what a guide publishes to
-- sell their guiding: the name they publish under, their profile page (their own site or their
-- listing on a guiding platform), languages, specialties, areas, a published price with its page,
-- a third-party platform's rating with its review count and page, whether an official licence is
-- shown, a summary of their public reputation (English and Vietnamese, in our own words) and the
-- pages it was written from. Never a phone number, an email, a home address or anything private:
-- the loader refuses such lines and the checks below refuse an email anywhere in the row. It is
-- public business information about a named guide, not data about any of our users, so it is C0
-- like a place; no user, crew or trip is linked to it.
--
-- A guide can be taken out on request: `hidden` keeps the row out of every reader (it can come
-- back), `removed` also blanks everything but the profile page, which stays only so a later load
-- never brings the guide back. A guide listed twice is merged: the duplicate points at the row it
-- is (`merged_into_id`) and is hidden. Readers see `listed` rows only.
CREATE TABLE local_guides (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  destination_id uuid NOT NULL REFERENCES destinations (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) <= 160),
  kind text NOT NULL CHECK (kind IN ('individual', 'company', 'community')),
  languages text[] NOT NULL DEFAULT '{}',
  specialties text[] NOT NULL DEFAULT '{}',
  areas text[] NOT NULL DEFAULT '{}',
  -- {text, source_url} as published, or null.
  price jsonb CHECK (price IS NULL OR jsonb_typeof(price) = 'object'),
  profile_url text NOT NULL CHECK (profile_url ~ '^https://'),
  -- {en, vi}: what travellers consistently praise or criticise, in our own words.
  review_summary jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(review_summary) = 'object'),
  -- {value, count, platform, url} from a third-party platform, or null.
  rating jsonb CHECK (rating IS NULL OR jsonb_typeof(rating) = 'object'),
  licensed text NOT NULL DEFAULT 'unknown' CHECK (licensed IN ('yes', 'no', 'unknown')),
  sources text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'listed' CHECK (status IN ('listed', 'hidden', 'removed')),
  merged_into_id uuid REFERENCES local_guides (id) ON DELETE SET NULL,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT local_guides_profile_key UNIQUE (destination_id, profile_url),
  CONSTRAINT local_guides_merged_hidden CHECK (merged_into_id IS NULL OR status <> 'listed'),
  CONSTRAINT local_guides_listed_named CHECK (status <> 'listed' OR (name <> '' AND review_summary ? 'en')),
  CONSTRAINT local_guides_removed_blank CHECK (
    status <> 'removed' OR (name = '' AND review_summary = '{}'::jsonb AND price IS NULL
      AND rating IS NULL AND languages = '{}' AND specialties = '{}' AND areas = '{}'
      AND sources = '{}')),
  CONSTRAINT local_guides_no_email CHECK (
    (name || ' ' || review_summary::text || ' ' || coalesce(price::text, '') || ' '
      || array_to_string(specialties || areas, ' '))
      !~* '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}')
);
CREATE INDEX local_guides_destination_idx ON local_guides (destination_id) WHERE status = 'listed';
CREATE TRIGGER local_guides_touch_updated_at BEFORE UPDATE ON local_guides
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE local_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE local_guides FORCE ROW LEVEL SECURITY;
CREATE POLICY local_guides_select ON local_guides FOR SELECT TO app_user USING (status = 'listed');
CREATE POLICY local_guides_system ON local_guides FOR ALL TO app_system USING (true) WITH CHECK (true);
CREATE POLICY local_guides_admin_reader ON local_guides FOR SELECT TO admin_reader USING (true);
GRANT SELECT ON local_guides TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON local_guides TO app_system;
GRANT SELECT (id, destination_id, name, kind, languages, specialties, areas, price, profile_url,
  review_summary, rating, licensed, sources, status, merged_into_id, loaded_at, created_at,
  updated_at) ON local_guides TO admin_reader;
