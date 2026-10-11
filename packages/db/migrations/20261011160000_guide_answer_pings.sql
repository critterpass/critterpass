-- "Ping me" on a slow guide answer: the asker leaves the guide while it is still working and asks to
-- hear when the answer lands. One row per (thread, user) waits until the server saves the thread's
-- next answer, which pushes it and deletes the row; a row older than an hour has been answered or
-- given up and is ignored. Only the server reads or writes it (RLS class S, C1: ids and a time).
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
