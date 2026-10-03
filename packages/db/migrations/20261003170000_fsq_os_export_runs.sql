-- FSQ OS Places exports for the multi-destination POI ingest. The Places Portal catalog table is not
-- partitioned, so a bbox read scans all of it; one run reads it once, in chunks of its data files,
-- keeping the rows inside any destination's place box. Each chunk is its own job and lands here in
-- one transaction with its progress row, so a worker restart costs one chunk, not the whole scan.
-- When the last chunk lands the run queues one ingest per destination, which reads its rows from
-- here and deletes them once ingested; a new run deletes older runs. Open data (Apache-2.0), class
-- C0, server-only (RLS "S"): no client role reads these.

CREATE TABLE fsq_os_export_runs (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  -- [{slug, minLat, maxLat, minLng, maxLng}] the run covers.
  targets jsonb NOT NULL,
  chunk_count integer NOT NULL CHECK (chunk_count >= 0),
  fanned_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE fsq_os_export_chunks (
  run_id uuid NOT NULL REFERENCES fsq_os_export_runs (id) ON DELETE CASCADE,
  chunk integer NOT NULL CHECK (chunk >= 0),
  files text[] NOT NULL,
  row_count integer CHECK (row_count >= 0),
  done_at timestamptz,
  PRIMARY KEY (run_id, chunk)
);

CREATE TABLE fsq_os_export_rows (
  run_id uuid NOT NULL REFERENCES fsq_os_export_runs (id) ON DELETE CASCADE,
  slug text NOT NULL,
  fsq_place_id text NOT NULL,
  name text NOT NULL,
  category_labels text[] NOT NULL DEFAULT '{}',
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  address text,
  website text,
  phone text,
  PRIMARY KEY (run_id, slug, fsq_place_id)
);

ALTER TABLE fsq_os_export_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fsq_os_export_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY fsq_os_export_runs_system ON fsq_os_export_runs FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON fsq_os_export_runs TO app_system;

ALTER TABLE fsq_os_export_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE fsq_os_export_chunks FORCE ROW LEVEL SECURITY;
CREATE POLICY fsq_os_export_chunks_system ON fsq_os_export_chunks FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON fsq_os_export_chunks TO app_system;

ALTER TABLE fsq_os_export_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE fsq_os_export_rows FORCE ROW LEVEL SECURITY;
CREATE POLICY fsq_os_export_rows_system ON fsq_os_export_rows FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON fsq_os_export_rows TO app_system;
