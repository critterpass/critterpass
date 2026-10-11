-- "Ping me" on a slow guide answer: the asker leaves the guide while it is still working and asks to
-- hear when the answer lands. One row per (thread, user) waits until the server saves the thread's
-- next answer, which pushes it and deletes the row; a row older than an hour has been answered or
-- given up and is ignored. Only the server reads or writes it (RLS class S, C4: never synced).
CREATE TABLE guide_answer_pings (
  thread_id uuid NOT NULL REFERENCES guide_threads (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);
CREATE INDEX guide_answer_pings_user_idx ON guide_answer_pings (user_id);
ALTER TABLE guide_answer_pings ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_answer_pings FORCE ROW LEVEL SECURITY;
CREATE POLICY guide_answer_pings_system ON guide_answer_pings FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON guide_answer_pings TO app_system;

-- domain_events: `guide.answer_ready` (the ping's push) joins the catalogue
-- (packages/domain/src/guide/events.ts), added to whatever the constraint lists now.
DO $$
DECLARE
  current_types text[];
  merged text;
BEGIN
  SELECT array_agg(m[1] ORDER BY m[1]) INTO current_types
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = 'domain_events_type_check' AND c.conrelid = 'domain_events'::regclass;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_types || ARRAY['guide.answer_ready']) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;
