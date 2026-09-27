-- FX rate snapshots (docs/data-model.md §3.8): one immutable row per (base, quote, as_of, source),
-- ingested from Frankfurter. `expenses.fx_snapshot_id` and similar columns pin a conversion to one
-- row's exact rate, so a snapshot is never updated in place once inserted — only ever inserted
-- (idempotent upsert via `ON CONFLICT ... DO NOTHING`) — which is also why app_system gets no
-- UPDATE/DELETE grant below, only SELECT/INSERT.

CREATE TABLE fx_snapshots (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  base text NOT NULL,
  quote text NOT NULL,
  rate numeric(20, 10) NOT NULL,
  as_of date NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (base, quote, as_of, source)
);
ALTER TABLE fx_snapshots ADD CONSTRAINT fx_snapshots_rate_positive_check CHECK (rate > 0);
ALTER TABLE fx_snapshots ADD CONSTRAINT fx_snapshots_base_quote_check CHECK (base <> quote);
CREATE INDEX fx_snapshots_lookup_idx ON fx_snapshots (base, quote, as_of DESC);
ALTER TABLE fx_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE fx_snapshots FORCE ROW LEVEL SECURITY;

-- RLS "R": read-all authenticated, no app_user write (docs/data-model.md §3.8). Authz "sys": only
-- the Frankfurter ingest job writes this table; there is no admin console path for it.
CREATE POLICY fx_snapshots_select ON fx_snapshots FOR SELECT TO app_user USING (true);
CREATE POLICY fx_snapshots_system ON fx_snapshots FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON fx_snapshots TO app_user;
GRANT SELECT, INSERT ON fx_snapshots TO app_system;

-- PowerSync publication (docs/code-standards.md §13): guarded add, idempotent and order-independent
-- (packages/db/src/publication.ts#computePublicationAllowList is the source of truth this is
-- hand-copied from; packages/db/test/publication.test.ts cross-checks the two never drift).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'fx_snapshots'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE fx_snapshots;
  END IF;
  -- GRANT is itself idempotent (re-granting an already-held privilege is a no-op).
  GRANT SELECT ON fx_snapshots TO powersync_repl;
END
$$;
