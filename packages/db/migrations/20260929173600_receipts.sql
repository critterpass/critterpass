-- Receipt scans (docs/data-model.md §3.8): the photo's private media key, the on-device OCR lines
-- keyed by line id, the parse the server validated against those lines, and the assignment
-- suggestions. The scanner owns the row; once committed, the crew reads it through its expense.

CREATE TABLE receipts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  crew_id uuid NOT NULL REFERENCES crews (id),
  expense_id uuid REFERENCES expenses (id),
  media_key text CHECK (char_length(media_key) <= 300),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'parsed', 'partial', 'failed', 'committed')),
  -- What the camera saw wrong (drives the failure chip), when anything.
  quality_issue text CHECK (quality_issue IN ('crumpled', 'blurry', 'glare', 'cut_off')),
  -- `device`: on-device OCR lines `l{n}`; `server`: the server transcribed the photo into `s{n}`.
  ocr_source text NOT NULL DEFAULT 'device' CHECK (ocr_source IN ('device', 'server')),
  ocr_lines jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(ocr_lines) = 'array' AND jsonb_array_length(ocr_lines) <= 200),
  parsed jsonb CHECK (parsed IS NULL OR jsonb_typeof(parsed) = 'object'),
  suggestions jsonb CHECK (suggestions IS NULL OR jsonb_typeof(suggestions) = 'object'),
  failure_reason text CHECK (char_length(failure_reason) <= 80),
  parsed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'committed') = (expense_id IS NOT NULL))
);
CREATE INDEX receipts_user_id_idx ON receipts (user_id);
CREATE INDEX receipts_trip_id_idx ON receipts (trip_id);
CREATE INDEX receipts_crew_id_idx ON receipts (crew_id);
CREATE INDEX receipts_expense_id_idx ON receipts (expense_id) WHERE expense_id IS NOT NULL;
CREATE TRIGGER receipts_touch_updated_at BEFORE UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE expenses ADD CONSTRAINT expenses_receipt_id_fkey
  FOREIGN KEY (receipt_id) REFERENCES receipts (id);
CREATE INDEX expenses_receipt_id_idx ON expenses (receipt_id) WHERE receipt_id IS NOT NULL;

-- RLS class O for the scanner (C2), plus the crew of a committed receipt's trip. The scanner
-- uploads their own row; the parse, suggestions and commit are written by the server.
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY receipts_select ON receipts FOR SELECT TO app_user
  USING (user_id = app.uid() OR (expense_id IS NOT NULL AND app.is_trip_member(trip_id)));
CREATE POLICY receipts_owner_insert ON receipts FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.is_trip_member(trip_id) AND app.is_crew_member(crew_id));
CREATE POLICY receipts_system ON receipts FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON receipts TO app_user;
GRANT INSERT (id, user_id, trip_id, crew_id, media_key, quality_issue, ocr_source, ocr_lines)
  ON receipts TO app_user;
GRANT SELECT, INSERT, UPDATE ON receipts TO app_system;
GRANT SELECT (id, user_id, trip_id, crew_id, expense_id, status, quality_issue, ocr_source,
  failure_reason, parsed_at, created_at, updated_at) ON receipts TO admin_reader;
CREATE POLICY receipts_admin_reader ON receipts FOR SELECT TO admin_reader USING (true);

-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'receipts'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE receipts;
  END IF;
END
$$;
GRANT SELECT ON receipts TO powersync_repl;
