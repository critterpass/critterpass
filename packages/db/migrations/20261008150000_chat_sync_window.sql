-- The chat sync window (docs/data-model.md §3.6, docs/data-model-sync-and-privacy.md §4): a phone
-- holds the latest 1,000 messages of a crew and reads older ones from the api. A stream filter can
-- only read the row it is deciding on, so the window is a flag on each row: `in_sync_window` is true
-- for the 1,000 highest `seq` of a crew and false below them, and a reaction carries its message's
-- flag. `seq` is gap-free and a deleted message stays as a tombstone, so "the 1,000 highest seq" is
-- "seq above the crew's last seq minus 1,000"; no row is ever removed from under the window.
--
-- The default is true and a constant, so adding the column rewrites nothing; only rows that are
-- already outside a window are written by the backfill.
ALTER TABLE messages ADD COLUMN in_sync_window boolean NOT NULL DEFAULT true;
ALTER TABLE message_reactions ADD COLUMN in_sync_window boolean NOT NULL DEFAULT true;
GRANT SELECT (in_sync_window) ON messages TO admin_reader;
GRANT SELECT (in_sync_window) ON message_reactions TO admin_reader;

-- The row a new message pushes out is the lowest of this index: one single-row read per send.
CREATE INDEX messages_sync_window_idx ON messages (crew_id, seq) WHERE in_sync_window;

-- ---------------------------------------------------------------------------------------------
-- Sliding the window: a new message takes the row 1,000 below it out, with its reactions. `seq`
-- has no gaps and every insert slides, so that row is the only one below the window that can still
-- be inside it. It is asked for by its own `seq`: a range (`seq <= NEW.seq - 1000 AND
-- in_sync_window`) is planned as most of the crew's history, since the planner cannot know the two
-- conditions exclude each other, and on a crew that makes up much of the table it scans every
-- message.
-- Sends of one crew are serialised by the counter's row lock, so two sends never slide the same
-- crew at once. The reactions are a statement of their own, read after the message row is locked,
-- so a reaction committed while this waited is seen.
CREATE OR REPLACE FUNCTION app.slide_chat_sync_window() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  left_window uuid;
BEGIN
  IF NEW.seq <= 1000 THEN
    RETURN NULL;
  END IF;
  UPDATE messages SET in_sync_window = false
   WHERE crew_id = NEW.crew_id AND seq = NEW.seq - 1000 AND in_sync_window
  RETURNING id INTO left_window;
  IF left_window IS NOT NULL THEN
    UPDATE message_reactions SET in_sync_window = false
     WHERE message_id = left_window AND in_sync_window;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.slide_chat_sync_window() FROM PUBLIC;
CREATE TRIGGER messages_slide_sync_window AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION app.slide_chat_sync_window();

-- A reaction takes its crew and its window flag from the message. The message row is share-locked
-- while it is read: a send that is moving the message out of the window either finishes first (the
-- reaction reads false) or waits for this reaction and then takes it out with the message.
CREATE OR REPLACE FUNCTION app.message_reaction_crew() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  SELECT m.crew_id, m.in_sync_window INTO NEW.crew_id, NEW.in_sync_window
    FROM messages m WHERE m.id = NEW.message_id FOR SHARE;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.message_reaction_crew() FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------
-- Existing crews: everything 1,000 or more below the crew's last seq leaves the window.
UPDATE messages m SET in_sync_window = false
  FROM crew_chat_counters c
 WHERE c.crew_id = m.crew_id AND c.last_seq > 1000 AND m.seq <= c.last_seq - 1000;
UPDATE message_reactions r SET in_sync_window = false
  FROM messages m
 WHERE m.id = r.message_id AND NOT m.in_sync_window;
