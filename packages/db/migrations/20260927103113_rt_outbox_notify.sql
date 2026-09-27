-- Wakes the rt_outbox relay as soon as a transaction that queued realtime rows commits
-- (docs/system-architecture.md §4.3: LISTEN wake + 1 s sweep). NOTIFY is transactional: it is
-- delivered only at COMMIT and dropped on ROLLBACK, so a listener can never be woken for rows it
-- cannot see yet. Statement-level with an empty payload: Postgres folds identical notifications
-- within one transaction into one, so a command that queues many rows wakes the relay once; the
-- relay reads the rows themselves, never the payload.
CREATE OR REPLACE FUNCTION app.notify_rt_outbox() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  PERFORM pg_notify('rt_outbox', '');
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION app.notify_rt_outbox() FROM PUBLIC;

CREATE TRIGGER rt_outbox_notify AFTER INSERT ON rt_outbox
  FOR EACH STATEMENT EXECUTE FUNCTION app.notify_rt_outbox();

-- The relay's batch query: pending rows in insertion order (`WHERE published_at IS NULL ORDER BY
-- id LIMIT 100 FOR UPDATE SKIP LOCKED`). Partial, so it stays as small as the backlog itself while
-- published rows wait out their 7-day retention.
CREATE INDEX rt_outbox_unpublished_idx ON rt_outbox (id) WHERE published_at IS NULL;
