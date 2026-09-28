-- Home, inbox, nudges and tips (docs/data-model.md §3.9, §3.11): saved items, reminders, the
-- crew's tip strip, nudges between crewmates, per-hour app-open counts, the inbox columns the
-- fan-out and the inbox screen need, the inbox resolver and the new domain events.

-- ---------------------------------------------------------------------------------------------
-- saved_items: RLS class O. The owner saves and renames; unsaving goes through its command.
CREATE TABLE saved_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('place', 'plan', 'day')),
  ref_id uuid NOT NULL,
  list_name text CHECK (char_length(list_name) BETWEEN 1 AND 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saved_items_user_ref_key UNIQUE (user_id, kind, ref_id)
);
CREATE INDEX saved_items_user_kind_idx ON saved_items (user_id, kind);
CREATE TRIGGER saved_items_touch_updated_at BEFORE UPDATE ON saved_items
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_items FORCE ROW LEVEL SECURITY;
CREATE POLICY saved_items_self ON saved_items FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY saved_items_system ON saved_items FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT (id, user_id, kind, ref_id, list_name) ON saved_items TO app_user;
GRANT UPDATE (list_name) ON saved_items TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON saved_items TO app_system;

-- ---------------------------------------------------------------------------------------------
-- reminders: RLS class O. The owner sets one and may cancel it; the worker fires it.
CREATE TABLE reminders (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_kind text NOT NULL CHECK (target_kind IN ('form_window', 'quiet_window', 'legendary')),
  target_id uuid NOT NULL,
  fire_at timestamptz NOT NULL,
  condition jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(condition) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fired', 'cancelled')),
  fired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reminders_pending_fire_at_idx ON reminders (fire_at) WHERE status = 'pending';
CREATE INDEX reminders_user_id_idx ON reminders (user_id);
CREATE TRIGGER reminders_touch_updated_at BEFORE UPDATE ON reminders
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders FORCE ROW LEVEL SECURITY;
CREATE POLICY reminders_self ON reminders FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY reminders_system ON reminders FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT (id, user_id, target_kind, target_id, fire_at, condition) ON reminders TO app_user;
GRANT UPDATE (status) ON reminders TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON reminders TO app_system;

-- ---------------------------------------------------------------------------------------------
-- home_tips: RLS class M, system written. Active crew members read their crew's tips; dismissing
-- goes through `dismiss_tip`. `dedupe_key` keeps one tip per (crew, fact) so a daily rerun or a
-- fare update never repeats a tip.
CREATE TABLE home_tips (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  guide_id uuid REFERENCES guides (id),
  kind text NOT NULL CHECK (kind IN ('fare_drop', 'book_by', 'season_peak', 'crowd_dip')),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 120),
  facts jsonb NOT NULL CHECK (jsonb_typeof(facts) = 'object'),
  place_id uuid REFERENCES destinations (id),
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) <= 200),
  valid_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'expired')),
  dismissed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT home_tips_crew_dedupe_key UNIQUE (crew_id, dedupe_key)
);
CREATE INDEX home_tips_crew_status_idx ON home_tips (crew_id, status);
CREATE INDEX home_tips_place_id_idx ON home_tips (place_id) WHERE place_id IS NOT NULL;
CREATE INDEX home_tips_dismissed_by_idx ON home_tips (dismissed_by) WHERE dismissed_by IS NOT NULL;
CREATE TRIGGER home_tips_touch_updated_at BEFORE UPDATE ON home_tips
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE home_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_tips FORCE ROW LEVEL SECURITY;
CREATE POLICY home_tips_select ON home_tips FOR SELECT TO app_user
  USING (app.is_crew_member(crew_id));
CREATE POLICY home_tips_system ON home_tips FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON home_tips TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON home_tips TO app_system;

-- ---------------------------------------------------------------------------------------------
-- nudges: RLS class O for two owners. The sender and the target read the row; `send_nudge` writes
-- it as the system after its own checks. The (sender, target, created_at) index serves the
-- one-per-pair-per-day rule, (target, send_at) the target's daily cap.
CREATE TABLE nudges (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  sender_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  crew_id uuid NOT NULL REFERENCES crews (id),
  trip_id uuid REFERENCES trips (id),
  reason text NOT NULL CHECK (reason IN ('vote', 'rsvp', 'readiness', 'payment', 'invite_open')),
  context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context) = 'object'),
  channel text NOT NULL CHECK (channel IN ('push', 'inbox', 'share_sheet')),
  scheduled_delivery_id uuid REFERENCES scheduled_deliveries (id) ON DELETE SET NULL,
  send_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nudges_not_self CHECK (sender_id <> target_id)
);
CREATE INDEX nudges_pair_created_idx ON nudges (sender_id, target_id, created_at DESC);
CREATE INDEX nudges_target_send_at_idx ON nudges (target_id, send_at);
CREATE INDEX nudges_crew_id_idx ON nudges (crew_id);
CREATE INDEX nudges_trip_id_idx ON nudges (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX nudges_scheduled_delivery_id_idx ON nudges (scheduled_delivery_id)
  WHERE scheduled_delivery_id IS NOT NULL;
CREATE TRIGGER nudges_touch_updated_at BEFORE UPDATE ON nudges
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE nudges ENABLE ROW LEVEL SECURITY;
ALTER TABLE nudges FORCE ROW LEVEL SECURITY;
CREATE POLICY nudges_select ON nudges FOR SELECT TO app_user
  USING (sender_id = app.uid() OR target_id = app.uid());
CREATE POLICY nudges_system ON nudges FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON nudges TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON nudges TO app_system;

-- ---------------------------------------------------------------------------------------------
-- app_open_hours: RLS class X. Only the owner (through `record_app_open`) and the system touch it;
-- it is never published, never in an llm view and never granted to guide_reader or admin_reader.
CREATE TABLE app_open_hours (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  hour_local smallint NOT NULL CHECK (hour_local BETWEEN 0 AND 23),
  opens integer NOT NULL DEFAULT 0 CHECK (opens >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hour_local)
);
ALTER TABLE app_open_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_open_hours FORCE ROW LEVEL SECURITY;
CREATE POLICY app_open_hours_self ON app_open_hours FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY app_open_hours_system ON app_open_hours FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT (user_id, hour_local, opens, updated_at) ON app_open_hours TO app_user;
GRANT UPDATE (opens, updated_at) ON app_open_hours TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON app_open_hours TO app_system;

-- ---------------------------------------------------------------------------------------------
-- inbox_items: the fan-out's columns. `source_event_id` makes the fan-out idempotent per
-- (event, user); `resolve_key` lets any surface settle an item (a vote cast from a notification,
-- an undo from the plan); `read_at` is separate from `resolved_at` (read never resolves).
ALTER TABLE inbox_items
  ADD COLUMN source text NOT NULL DEFAULT 'system' CHECK (source IN ('crew', 'guide', 'system')),
  ADD COLUMN actor_id uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN source_event_id uuid,
  ADD COLUMN resolve_key text CHECK (char_length(resolve_key) <= 200),
  ADD COLUMN data jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  ADD COLUMN read_at timestamptz;
CREATE UNIQUE INDEX inbox_items_user_event_key ON inbox_items (user_id, source_event_id)
  WHERE source_event_id IS NOT NULL;
CREATE INDEX inbox_items_open_resolve_key_idx ON inbox_items (resolve_key)
  WHERE resolved_at IS NULL AND resolve_key IS NOT NULL;
CREATE INDEX inbox_items_actor_id_idx ON inbox_items (actor_id) WHERE actor_id IS NOT NULL;
GRANT UPDATE (read_at) ON inbox_items TO app_user;

-- Settles every open item filed under one of `keys` and returns whose they were, so the caller
-- can refresh those users' badge counts. Called by the fan-out (as app_system) when an event
-- settles something; a command settles its own item through the owner's column grant instead.
CREATE OR REPLACE FUNCTION app.resolve_inbox_items(keys text[], at timestamptz)
RETURNS TABLE (id uuid, user_id uuid)
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
  UPDATE inbox_items i SET resolved_at = at
  WHERE i.resolve_key = ANY (keys) AND i.resolved_at IS NULL
  RETURNING i.id, i.user_id
$$;
REVOKE EXECUTE ON FUNCTION app.resolve_inbox_items(text[], timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.resolve_inbox_items(text[], timestamptz) TO app_system;

-- The badge counts of one user: open needs-you items (the bell and the app icon) and unread ones.
CREATE OR REPLACE FUNCTION app.inbox_badge_counts(p_user uuid, at timestamptz)
RETURNS TABLE (needs_you integer, unread integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog, public AS $$
  SELECT
    count(*) FILTER (WHERE i.needs_you)::integer,
    count(*) FILTER (WHERE i.read_at IS NULL)::integer
  FROM inbox_items i
  WHERE i.user_id = p_user AND i.resolved_at IS NULL
    AND (i.expires_at IS NULL OR i.expires_at > at)
$$;
REVOKE EXECUTE ON FUNCTION app.inbox_badge_counts(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.inbox_badge_counts(uuid, timestamptz) TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- domain_events: inbox, nudge, tip and countdown-input events join the catalogue
-- (packages/domain/src/home/events.ts).
ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (
  'crew.member_joined', 'crew.member_left', 'crew.member_removed',
  'trip.created', 'trip.status_changed',
  'plan.version_created',
  'change_set.proposed', 'change_set.applied', 'change_set.reverted', 'change_set.rejected',
  'rsvp.changed',
  'auth.merged',
  'invite.opened', 'attribution.claimed',
  'guide_action.undone',
  'fare.dropped', 'forecast.changed', 'hazard.changed',
  'moderation.decided',
  'entitlement.granted', 'entitlement.revoked',
  'device.permissions_changed', 'visit.recorded',
  'pass.issued', 'profile.updated', 'profile.taste_changed', 'profile.avatar_changed',
  'crew.created', 'crew.updated', 'crew.code_rotated', 'user.active_crew_changed',
  'invite.created', 'invite.claimed', 'invite.deferred', 'invite.declined', 'invite.revoked',
  'invite.nudged', 'trip.seat_opened', 'seat_offer.accepted', 'referral.progressed',
  'chat.message_sent', 'chat.message_edited', 'chat.message_deleted', 'chat.reaction_changed',
  'chat.guide_mentioned',
  'inbox.item_resolved', 'inbox.read',
  'nudge.sent', 'nudge.received',
  'tip.created', 'tip.dismissed',
  'trip.dates_changed', 'trip.destination_set',
  'booking.flight_added', 'booking.flight_changed', 'booking.flight_removed',
  'user.tz_changed'
));

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList. app_open_hours stays out.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY['saved_items', 'reminders', 'home_tips', 'nudges'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON saved_items, reminders, home_tips, nudges TO powersync_repl;
