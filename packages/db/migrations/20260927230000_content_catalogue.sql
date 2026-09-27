-- Content catalogue (docs/data-model.md §3.9, §3.13, §3.15, §3.16): releases produced by the
-- content factory and the live catalogue tables the publish job writes from them.
--
-- A release (`content_releases`) holds its whole artifact (the checksummed envelope) and moves
-- draft → review → approved → published (or blocked / rejected); publishing a newer release of the
-- same kind marks the previous one superseded. Catalogue tables only ever hold rows of the live
-- release: the publish job upserts every item and deletes what the release no longer has, in one
-- transaction. Rows carry `release_id`, and app_user reads a row only while its release is the
-- published one.
--
-- Names stay server-side until found: catalogue rows carry no names. `critter_names` (critter and
-- form names per locale) has no grant to app_user, powersync_repl, guide_reader or admin_reader;
-- `app.set_collected_name` copies a name into the caller's own collection entry once they have
-- found that form. CHECK lists mirror packages/content/src/schemas/*.ts.

CREATE TABLE content_releases (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  kind text NOT NULL,
  version integer NOT NULL,
  batch_key text NOT NULL UNIQUE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  stage text NOT NULL DEFAULT 'brief',
  gate text,
  blocked_reason text,
  ip_status text NOT NULL DEFAULT 'not_applicable',
  checksum text NOT NULL,
  artifact jsonb NOT NULL,
  item_count integer NOT NULL,
  agent_job_id uuid REFERENCES agent_jobs (id),
  notes text,
  approved_by uuid,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, version)
);
ALTER TABLE content_releases ADD CONSTRAINT content_releases_kind_check CHECK (kind IN (
  'sets', 'critters', 'forms', 'spawns', 'windows', 'personas', 'places', 'phrases',
  'taste_quiz', 'help', 'emergency', 'facilities', 'insurance'
));
ALTER TABLE content_releases ADD CONSTRAINT content_releases_status_check CHECK (status IN (
  'draft', 'review', 'blocked', 'approved', 'published', 'superseded', 'rejected'
));
ALTER TABLE content_releases ADD CONSTRAINT content_releases_stage_check CHECK (stage IN (
  'brief', 'generate', 'validate', 'render', 'review', 'approve', 'publish'
));
ALTER TABLE content_releases ADD CONSTRAINT content_releases_gate_check CHECK (gate IS NULL OR gate IN (
  'ip_signoff', 'contact_sheets', 'places_review', 'window_sources', 'persona_review',
  'native_review', 'record_verification', 'owner_approval'
));
ALTER TABLE content_releases ADD CONSTRAINT content_releases_ip_status_check
  CHECK (ip_status IN ('not_applicable', 'open', 'clear', 'flagged'));
ALTER TABLE content_releases ADD CONSTRAINT content_releases_blocked_check
  CHECK ((status = 'blocked') = (blocked_reason IS NOT NULL));
ALTER TABLE content_releases ADD CONSTRAINT content_releases_approved_check
  CHECK (status NOT IN ('approved', 'published', 'superseded') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL));
ALTER TABLE content_releases ADD CONSTRAINT content_releases_checksum_check CHECK (checksum ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX content_releases_one_live_idx ON content_releases (kind) WHERE status = 'published';
CREATE INDEX content_releases_status_idx ON content_releases (status, updated_at DESC);
CREATE TRIGGER content_releases_touch_updated_at BEFORE UPDATE ON content_releases
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE content_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_releases FORCE ROW LEVEL SECURITY;
CREATE POLICY content_releases_system ON content_releases FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON content_releases TO app_system;

-- True while the release is the live one of its kind. SECURITY DEFINER so catalogue policies can
-- ask without app_user holding any grant on content_releases.
CREATE FUNCTION app.is_live_release(release uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.content_releases WHERE id = release AND status = 'published')
$$;
REVOKE ALL ON FUNCTION app.is_live_release(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_live_release(uuid) TO app_user, app_system, guide_reader;

-- The 61 places: one critter set each, with the destination index fields.
CREATE TABLE critter_sets (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  country text NOT NULL,
  rank smallint,
  set_group smallint NOT NULL,
  tz text NOT NULL,
  currency text NOT NULL,
  languages text[] NOT NULL,
  coverage text NOT NULL,
  guide_slug text,
  destination_id uuid REFERENCES destinations (id),
  hero_critter_key text NOT NULL,
  month_hints jsonb NOT NULL,
  release_id uuid NOT NULL REFERENCES content_releases (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE critter_sets ADD CONSTRAINT critter_sets_set_group_check CHECK (set_group BETWEEN 0 AND 3);
ALTER TABLE critter_sets ADD CONSTRAINT critter_sets_coverage_check CHECK (coverage IN ('live', 'guest'));
ALTER TABLE critter_sets ADD CONSTRAINT critter_sets_tz_check CHECK (app.valid_tz(tz));
ALTER TABLE critter_sets ADD CONSTRAINT critter_sets_country_check CHECK (country ~ '^[A-Z]{2}$');
ALTER TABLE critter_sets ADD CONSTRAINT critter_sets_currency_check CHECK (currency ~ '^[A-Z]{3}$');

CREATE TABLE critters (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  key text NOT NULL UNIQUE,
  set_id uuid NOT NULL REFERENCES critter_sets (id),
  no smallint NOT NULL UNIQUE,
  city text NOT NULL,
  species text NOT NULL,
  art_params jsonb NOT NULL,
  canonical_seed integer NOT NULL,
  note text NOT NULL,
  release_id uuid NOT NULL REFERENCES content_releases (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX critters_set_idx ON critters (set_id);

CREATE TABLE critter_forms (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  key text NOT NULL UNIQUE,
  critter_id uuid NOT NULL REFERENCES critters (id),
  rarity text NOT NULL,
  palette jsonb NOT NULL,
  pose text,
  edge text NOT NULL,
  note text NOT NULL,
  requirement_copy text NOT NULL,
  xp integer NOT NULL,
  release_id uuid NOT NULL REFERENCES content_releases (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (critter_id, rarity)
);
ALTER TABLE critter_forms ADD CONSTRAINT critter_forms_rarity_check
  CHECK (rarity IN ('common', 'rare', 'epic', 'legendary'));
ALTER TABLE critter_forms ADD CONSTRAINT critter_forms_pose_check CHECK (pose IS NULL OR pose IN (
  'idle', 'wave', 'cheer', 'think', 'point', 'sleep', 'crack', 'tilt', 'hop'
));
ALTER TABLE critter_forms ADD CONSTRAINT critter_forms_edge_check CHECK (edge IN ('none', 'epic', 'legendary'));
ALTER TABLE critter_forms ADD CONSTRAINT critter_forms_note_check CHECK (char_length(note) <= 140);

-- Critter names (form_id null) and form names, per locale. Never synced, never in a view.
CREATE TABLE critter_names (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  critter_id uuid NOT NULL REFERENCES critters (id),
  form_id uuid REFERENCES critter_forms (id),
  locale text NOT NULL,
  name text NOT NULL,
  name_native text,
  release_id uuid NOT NULL REFERENCES content_releases (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (critter_id, form_id, locale)
);
CREATE INDEX critter_names_form_idx ON critter_names (form_id) WHERE form_id IS NOT NULL;

CREATE TABLE legendary_windows (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  key text NOT NULL UNIQUE,
  form_id uuid NOT NULL REFERENCES critter_forms (id),
  place_line text NOT NULL,
  rule jsonb NOT NULL,
  months smallint[] NOT NULL,
  solar text,
  challenge text,
  source_url text,
  release_id uuid NOT NULL REFERENCES content_releases (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE legendary_windows ADD CONSTRAINT legendary_windows_solar_check
  CHECK (solar IS NULL OR solar IN ('after_dark', 'by_sunrise'));
ALTER TABLE legendary_windows ADD CONSTRAINT legendary_windows_source_check
  CHECK (rule->>'type' = 'any_day' OR source_url IS NOT NULL);

CREATE TABLE spawn_rules (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  key text NOT NULL UNIQUE,
  form_id uuid NOT NULL REFERENCES critter_forms (id),
  kind text NOT NULL,
  set_id uuid NOT NULL REFERENCES critter_sets (id),
  destination_id uuid REFERENCES destinations (id),
  poi_ids uuid[] NOT NULL DEFAULT '{}',
  geofences jsonb NOT NULL DEFAULT '[]'::jsonb,
  n smallint,
  dwell_s integer NOT NULL DEFAULT 300,
  hold_ms integer,
  window_id uuid REFERENCES legendary_windows (id),
  solar text,
  min_members smallint,
  foreground_only boolean NOT NULL DEFAULT false,
  copy text NOT NULL,
  release_id uuid NOT NULL REFERENCES content_releases (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE spawn_rules ADD CONSTRAINT spawn_rules_kind_check
  CHECK (kind IN ('presence', 'any_of', 'set_count', 'window', 'co_presence'));
ALTER TABLE spawn_rules ADD CONSTRAINT spawn_rules_solar_check
  CHECK (solar IS NULL OR solar IN ('after_dark', 'by_sunrise'));
ALTER TABLE spawn_rules ADD CONSTRAINT spawn_rules_window_check CHECK ((kind = 'window') = (window_id IS NOT NULL));
ALTER TABLE spawn_rules ADD CONSTRAINT spawn_rules_members_check
  CHECK ((kind = 'co_presence') = (min_members IS NOT NULL));
CREATE INDEX spawn_rules_destination_idx ON spawn_rules (destination_id);
CREATE INDEX spawn_rules_form_idx ON spawn_rules (form_id);

CREATE TABLE phrase_cards (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  key text NOT NULL UNIQUE,
  language text NOT NULL,
  context text NOT NULL,
  text text NOT NULL,
  romanisation text,
  gloss text NOT NULL,
  audio_key text,
  audio_status text NOT NULL,
  native_reviewed_on date,
  release_id uuid NOT NULL REFERENCES content_releases (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE phrase_cards ADD CONSTRAINT phrase_cards_context_check CHECK (context IN (
  'greetings', 'politeness', 'help', 'emergency', 'food', 'allergy', 'transport'
));
ALTER TABLE phrase_cards ADD CONSTRAINT phrase_cards_audio_check
  CHECK ((audio_status = 'ready') = (audio_key IS NOT NULL) AND audio_status IN ('ready', 'pending'));
-- Emergency and allergy cards reach the catalogue only after a native speaker has reviewed them.
ALTER TABLE phrase_cards ADD CONSTRAINT phrase_cards_native_review_check
  CHECK (context NOT IN ('emergency', 'allergy') OR native_reviewed_on IS NOT NULL);
CREATE INDEX phrase_cards_language_idx ON phrase_cards (language, context);

-- Safety records reach the catalogue only once a person has verified them.
CREATE TABLE emergency_numbers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  country text NOT NULL UNIQUE,
  numbers jsonb NOT NULL,
  source_url text NOT NULL,
  retrieved_on date NOT NULL,
  verified_at timestamptz NOT NULL,
  release_id uuid NOT NULL REFERENCES content_releases (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE emergency_numbers ADD CONSTRAINT emergency_numbers_country_check CHECK (country ~ '^[A-Z]{2}$');

CREATE TABLE facilities (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  key text NOT NULL UNIQUE,
  destination_id uuid NOT NULL REFERENCES destinations (id),
  kind text NOT NULL,
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  address text NOT NULL,
  phone text,
  open_24h boolean,
  source_url text NOT NULL,
  retrieved_on date NOT NULL,
  verified_at timestamptz NOT NULL,
  release_id uuid NOT NULL REFERENCES content_releases (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE facilities ADD CONSTRAINT facilities_kind_check
  CHECK (kind IN ('hospital', 'clinic', 'pharmacy', 'embassy'));
CREATE INDEX facilities_destination_idx ON facilities (destination_id, kind);

CREATE TABLE help_articles (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  slug text NOT NULL,
  locale text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  body_md text NOT NULL,
  embedding vector(1024),
  fts tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', app.unaccent_immutable(title)), 'A') ||
    setweight(to_tsvector('simple', app.unaccent_immutable(summary)), 'B') ||
    setweight(to_tsvector('simple', app.unaccent_immutable(body_md)), 'C')
  ) STORED,
  release_id uuid NOT NULL REFERENCES content_releases (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, locale)
);
ALTER TABLE help_articles ADD CONSTRAINT help_articles_category_check CHECK (category IN (
  'getting_started', 'trips_and_crews', 'splitting_money', 'passes_and_boosts', 'refunds',
  'bookings', 'critters', 'offline_and_maps', 'safety', 'insurance', 'privacy_and_account'
));
CREATE INDEX help_articles_fts_idx ON help_articles USING gin (fts);
CREATE INDEX help_articles_embedding_idx ON help_articles USING hnsw (embedding vector_cosine_ops);

-- Opening hours researched from official sites: a proposal until a person verifies it; only
-- verification copies the hours onto the POI.
CREATE TABLE poi_hours_proposals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  poi_id uuid NOT NULL REFERENCES pois (id),
  hours jsonb NOT NULL,
  source_url text NOT NULL,
  fetched_at timestamptz NOT NULL,
  batch_key text NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poi_id, batch_key)
);
ALTER TABLE poi_hours_proposals ADD CONSTRAINT poi_hours_proposals_status_check
  CHECK (status IN ('proposed', 'verified', 'rejected'));
ALTER TABLE poi_hours_proposals ADD CONSTRAINT poi_hours_proposals_decided_check
  CHECK ((status = 'proposed') = (decided_at IS NULL));
CREATE INDEX poi_hours_proposals_open_idx ON poi_hours_proposals (created_at) WHERE status = 'proposed';

-- Shared RLS/grant shape for the live catalogue tables.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'critter_sets', 'critters', 'critter_forms', 'critter_names', 'legendary_windows', 'spawn_rules',
    'phrase_cards', 'emergency_numbers', 'facilities', 'help_articles', 'poi_hours_proposals'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t || '_touch_updated_at', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO app_system USING (true) WITH CHECK (true)', t || '_system', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_system', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY[
    'critter_sets', 'critters', 'critter_forms', 'legendary_windows', 'spawn_rules',
    'phrase_cards', 'emergency_numbers', 'facilities', 'help_articles'
  ] LOOP
    EXECUTE format('CREATE INDEX %I ON %I (release_id)', t || '_release_idx', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO app_user USING (app.is_live_release(release_id))', t || '_select', t);
    EXECUTE format('GRANT SELECT ON %I TO app_user', t);
  END LOOP;
  -- help_articles is served over HTTP search and the help stream; everything else syncs.
  FOREACH t IN ARRAY ARRAY[
    'critter_sets', 'critters', 'critter_forms', 'legendary_windows', 'spawn_rules',
    'phrase_cards', 'emergency_numbers', 'facilities', 'help_articles'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
    EXECUTE format('GRANT SELECT ON %I TO powersync_repl', t);
  END LOOP;
END
$$;

-- Copies a found form's names into the caller's own collection entry (the entry exists once the
-- collect command has recorded the find). Never touches another user's row.
CREATE FUNCTION app.set_collected_name(form uuid, want_locale text DEFAULT 'en') RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  uid uuid := app.uid();
  critter_label text;
  form_label text;
  updated integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'set_collected_name needs a signed-in caller' USING ERRCODE = '42501';
  END IF;
  SELECT cn.name INTO critter_label
  FROM critter_forms f JOIN critter_names cn ON cn.critter_id = f.critter_id AND cn.form_id IS NULL
  WHERE f.id = form AND cn.locale IN (want_locale, 'en')
  ORDER BY cn.locale = want_locale DESC LIMIT 1;
  SELECT cn.name INTO form_label FROM critter_names cn
  WHERE cn.form_id = form AND cn.locale IN (want_locale, 'en')
  ORDER BY cn.locale = want_locale DESC LIMIT 1;
  IF critter_label IS NULL THEN
    RETURN false;
  END IF;
  EXECUTE 'UPDATE public.collection_entries SET critter_name = $1, form_name = $2 WHERE user_id = $3 AND form_id = $4'
    USING critter_label, form_label, uid, form;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated > 0;
END
$$;
REVOKE ALL ON FUNCTION app.set_collected_name(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_collected_name(uuid, text) TO app_user, app_system;

-- Review of release items (docs/data-model.md §3.16): one row per item, the validator report and
-- the reviewer's verdict.
CREATE TABLE ops.content_reviews (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  release_id uuid NOT NULL REFERENCES content_releases (id),
  item_ref text NOT NULL,
  render_key text,
  severity text NOT NULL,
  report jsonb NOT NULL DEFAULT '[]'::jsonb,
  verdict text NOT NULL DEFAULT 'pending',
  reviewer uuid,
  notes text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (release_id, item_ref)
);
ALTER TABLE ops.content_reviews ADD CONSTRAINT content_reviews_severity_check
  CHECK (severity IN ('pass', 'warn', 'fail'));
ALTER TABLE ops.content_reviews ADD CONSTRAINT content_reviews_verdict_check
  CHECK (verdict IN ('pending', 'keep', 'reject'));
ALTER TABLE ops.content_reviews ADD CONSTRAINT content_reviews_reviewed_check
  CHECK ((verdict = 'pending') = (reviewed_at IS NULL));
CREATE TRIGGER content_reviews_touch_updated_at BEFORE UPDATE ON ops.content_reviews
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE ops.content_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.content_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY content_reviews_system ON ops.content_reviews FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY content_reviews_admin_reader ON ops.content_reviews FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.content_reviews TO app_system;
GRANT SELECT ON ops.content_reviews TO admin_reader;

-- The guide reads phrase cards and help articles through llm views only.
CREATE VIEW llm.phrase_cards AS
SELECT key, language, context, text, romanisation, gloss
FROM phrase_cards
WHERE app.is_live_release(release_id);

CREATE VIEW llm.help_articles AS
SELECT slug, locale, category, title, summary, body_md
FROM help_articles
WHERE app.is_live_release(release_id);

GRANT SELECT ON llm.phrase_cards, llm.help_articles TO guide_reader;

-- admin_reader: every column of the release and live catalogue tables (all C0); never the names.
-- BEGIN GENERATED admin_reader grants
GRANT SELECT (agent_job_id, approved_at, approved_by, artifact, batch_key, blocked_reason, checksum, created_at, gate, id, ip_status, item_count, kind, notes, published_at, stage, status, title, updated_at, version) ON content_releases TO admin_reader;
CREATE POLICY content_releases_admin_reader ON content_releases FOR SELECT TO admin_reader USING (true);
GRANT SELECT (created_at, fetched_at, batch_key, decided_at, decided_by, hours, id, poi_id, source_url, status, updated_at) ON poi_hours_proposals TO admin_reader;
CREATE POLICY poi_hours_proposals_admin_reader ON poi_hours_proposals FOR SELECT TO admin_reader USING (true);
-- END GENERATED admin_reader grants
