-- Travel estimates written from cited web pages (docs/product-decisions.md D30): the state of a
-- destination's links run, and the ways to reach a destination from a home city.

-- ---------------------------------------------------------------------------------------------
-- destination_link_runs: one row per destination whose day trips and onward links
-- (`destination_links`, origin 'ai') the `places.destination_brief` job has looked for: when,
-- what it cost, how many links it kept and what it dropped. A destination is looked at again
-- after `expires_at`. Authz "sys", RLS "S", privacy class C0: server-only.
CREATE TABLE destination_link_runs (
  destination_id uuid PRIMARY KEY REFERENCES destinations (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'declined', 'failed')),
  links integer NOT NULL DEFAULT 0 CHECK (links >= 0),
  dropped jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dropped) = 'array'),
  model text,
  cost_micros bigint NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  error text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- The daily spend cap sums today's runs.
CREATE INDEX destination_link_runs_requested_at_idx ON destination_link_runs (requested_at);
ALTER TABLE destination_link_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE destination_link_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY destination_link_runs_system ON destination_link_runs FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON destination_link_runs TO app_system;

-- ---------------------------------------------------------------------------------------------
-- destination_home_links: how travellers get from a home city to a destination, one row per
-- pair. `origin_key` is the IATA code of a home airport or metro group ("SGN", "LON") and
-- `origin_name` its city; the row is keyed by the two places, never by a person or a trip, so one
-- row serves everyone who lives there. `ways` [{mode flight|train|bus|car|boat, minutes (one
-- way), cost_pp_minor, cost_currency (both or neither), note {locale: line}, sources [{url,
-- title, quote}]}]: each way is an estimate kept only with the page and sentence it came from.
-- Written on demand by `places.home_link`; ready for `expires_at`.
-- Authz "sys", RLS "R", privacy class C0: about two places, never about who asked. Not synced:
-- phones read it through the api.
CREATE TABLE destination_home_links (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  destination_id uuid NOT NULL REFERENCES destinations (id) ON DELETE CASCADE,
  origin_key text NOT NULL CHECK (origin_key ~ '^[A-Z]{3}$'),
  origin_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'ready', 'declined', 'failed')),
  ways jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(ways) = 'array'),
  dropped jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dropped) = 'array'),
  model text,
  cost_micros bigint NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  error text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  generated_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT destination_home_links_pair_key UNIQUE (destination_id, origin_key),
  -- A ready row holds at least one cited way.
  CONSTRAINT destination_home_links_ready_check
    CHECK (status <> 'ready' OR jsonb_array_length(ways) > 0)
);
CREATE INDEX destination_home_links_requested_at_idx ON destination_home_links (requested_at);
ALTER TABLE destination_home_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE destination_home_links FORCE ROW LEVEL SECURITY;
CREATE POLICY destination_home_links_select ON destination_home_links FOR SELECT TO app_user
  USING (true);
CREATE POLICY destination_home_links_system ON destination_home_links FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON destination_home_links TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON destination_home_links TO app_system;
