-- Expand-only on guide_actions (docs/data-model.md §3.3): the registered inverse of a reversible
-- action, its undo window and the disruption it belongs to ("undo everything" for one disruption),
-- plus the `undone` status and a status guard mirroring packages/domain/src/ai/tables.ts
-- #GUIDE_ACTION_TRANSITIONS (docs/data-model-sync-and-privacy.md §3.6).
-- guide_offers / guide_offer_claims (§3.3): a guide offer posted in crew chat ("2 seats on the
-- sunset boat, tap to join"); created by app_system, claimed by trip members themselves.

ALTER TABLE guide_actions
  ADD COLUMN inverse jsonb,
  ADD COLUMN undo_until timestamptz,
  ADD COLUMN disruption_id uuid;
COMMENT ON COLUMN guide_actions.disruption_id IS 'No FK yet: disruptions does not exist until a later phase.';
CREATE INDEX guide_actions_disruption_idx ON guide_actions (disruption_id) WHERE disruption_id IS NOT NULL;
ALTER TABLE guide_actions DROP CONSTRAINT guide_actions_status_check;
ALTER TABLE guide_actions ADD CONSTRAINT guide_actions_status_check CHECK (status IN ('planned', 'needs_approval', 'running', 'done', 'failed', 'undone'));

-- planned -> needs_approval | running (the autonomy policy's `auto` skips approval);
-- needs_approval -> running; running -> done | failed; done -> undone, reversible actions only.
CREATE OR REPLACE FUNCTION app.guide_actions_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'planned' THEN
      RAISE EXCEPTION 'guide action must start planned, got %', NEW.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status, NEW.status) IN (
      ('planned', 'needs_approval'), ('planned', 'running'), ('needs_approval', 'running'),
      ('running', 'done'), ('running', 'failed'), ('done', 'undone')
    )) THEN
      RAISE EXCEPTION 'illegal guide action transition % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'undone' AND NOT OLD.reversible THEN
      RAISE EXCEPTION 'guide action % is not reversible', OLD.id USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
REVOKE EXECUTE ON FUNCTION app.guide_actions_guard() FROM PUBLIC;
CREATE TRIGGER guide_actions_guard BEFORE INSERT OR UPDATE ON guide_actions
  FOR EACH ROW EXECUTE FUNCTION app.guide_actions_guard();

CREATE TABLE guide_offers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  message_id uuid,
  kind text NOT NULL,
  slots_total integer NOT NULL,
  slots_taken integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  target_ref jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN guide_offers.message_id IS 'No FK yet: messages does not exist until a later phase.';
ALTER TABLE guide_offers ADD CONSTRAINT guide_offers_status_check CHECK (status IN ('open', 'full', 'expired', 'cancelled'));
ALTER TABLE guide_offers ADD CONSTRAINT guide_offers_slots_check
  CHECK (slots_total > 0 AND slots_taken >= 0 AND slots_taken <= slots_total);
CREATE INDEX guide_offers_trip_id_idx ON guide_offers (trip_id);
CREATE TRIGGER guide_offers_touch_updated_at BEFORE UPDATE ON guide_offers
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE guide_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_offers FORCE ROW LEVEL SECURITY;

CREATE POLICY guide_offers_select ON guide_offers FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY guide_offers_system ON guide_offers FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON guide_offers TO app_user;
GRANT SELECT, INSERT, UPDATE ON guide_offers TO app_system;

CREATE TABLE guide_offer_claims (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  offer_id uuid NOT NULL REFERENCES guide_offers (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guide_offer_claims_offer_user_key UNIQUE (offer_id, user_id)
);
CREATE INDEX guide_offer_claims_trip_id_idx ON guide_offer_claims (trip_id);
ALTER TABLE guide_offer_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_offer_claims FORCE ROW LEVEL SECURITY;

-- A claim takes one slot under a row lock on its offer, so concurrent taps can never overfill it;
-- the last slot flips the offer to `full`. Deleting a claim (merge conflict resolution) releases it.
CREATE OR REPLACE FUNCTION app.guide_offer_claims_take() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  o guide_offers%ROWTYPE;
BEGIN
  SELECT * INTO o FROM guide_offers WHERE id = NEW.offer_id FOR UPDATE;
  IF NOT FOUND OR o.trip_id <> NEW.trip_id THEN
    RAISE EXCEPTION 'guide offer % not found on trip %', NEW.offer_id, NEW.trip_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF o.status <> 'open' OR o.slots_taken >= o.slots_total
     OR (o.expires_at IS NOT NULL AND o.expires_at <= now()) THEN
    RAISE EXCEPTION 'guide offer % is closed', o.id USING ERRCODE = 'check_violation';
  END IF;
  UPDATE guide_offers
     SET slots_taken = slots_taken + 1,
         status = CASE WHEN slots_taken + 1 >= slots_total THEN 'full' ELSE status END
   WHERE id = o.id;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION app.guide_offer_claims_release() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE guide_offers
     SET slots_taken = greatest(slots_taken - 1, 0),
         status = CASE WHEN status = 'full' THEN 'open' ELSE status END
   WHERE id = OLD.offer_id;
  RETURN OLD;
END
$$;
REVOKE EXECUTE ON FUNCTION app.guide_offer_claims_take() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION app.guide_offer_claims_release() FROM PUBLIC;
CREATE TRIGGER guide_offer_claims_take BEFORE INSERT ON guide_offer_claims
  FOR EACH ROW EXECUTE FUNCTION app.guide_offer_claims_take();
CREATE TRIGGER guide_offer_claims_release AFTER DELETE ON guide_offer_claims
  FOR EACH ROW EXECUTE FUNCTION app.guide_offer_claims_release();

CREATE POLICY guide_offer_claims_select ON guide_offer_claims FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY guide_offer_claims_insert ON guide_offer_claims FOR INSERT TO app_user
  WITH CHECK (user_id = app.uid() AND app.is_trip_member(trip_id));
CREATE POLICY guide_offer_claims_system ON guide_offer_claims FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON guide_offer_claims TO app_user;
-- DELETE: account merge drops an anon claim that collides with the existing user's own claim.
GRANT SELECT, INSERT, UPDATE, DELETE ON guide_offer_claims TO app_system;

DO $$
DECLARE
  allow_listed text[] := ARRAY['guide_offers', 'guide_offer_claims'];
  t text;
BEGIN
  FOREACH t IN ARRAY allow_listed LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', t);
    END IF;
    EXECUTE format('GRANT SELECT ON %I TO powersync_repl', t);
  END LOOP;
END
$$;
