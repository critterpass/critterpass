-- Invites, invite prefill and opens, referrals, seat waitlist offers and crew contact cards
-- (docs/data-model.md §3.2, §3.5), plus the crew columns and SECURITY DEFINER helpers the crew
-- and invite commands need.

-- ---------------------------------------------------------------------------------------------
-- Crew and member columns: crew art, the per-crew notification level (all / mentions / off,
-- NULL reads as mentions) and the caller's active crew.
ALTER TABLE crews ADD COLUMN art text CHECK (art ~ '^[a-z0-9_-]{1,40}$');
ALTER TABLE crews ADD CONSTRAINT crews_name_length CHECK (char_length(name) BETWEEN 1 AND 32) NOT VALID;
ALTER TABLE crew_members ADD CONSTRAINT crew_members_notify_level_check
  CHECK (notify_level IS NULL OR notify_level IN ('all', 'mentions', 'off'));
ALTER TABLE user_settings ADD COLUMN active_crew_id uuid REFERENCES crews (id);
GRANT UPDATE (name, art) ON crews TO app_user;
GRANT SELECT (art) ON crews TO admin_reader;
GRANT SELECT (active_crew_id) ON user_settings TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- invites: RLS class M plus the two people it names. A personal invite carries the SHA-256 of its
-- seat token (the token itself only ever lives in the link); a generic invite has none. Crew
-- members read every invite of their crew; the inviter and an in-app invitee read their own.
CREATE TABLE invites (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  trip_id uuid REFERENCES trips (id),
  inviter_id uuid NOT NULL REFERENCES users (id),
  join_code_id uuid REFERENCES join_codes (id),
  kind text NOT NULL CHECK (kind IN ('personal', 'generic')),
  seat_token_hash text CHECK (seat_token_hash ~ '^[0-9a-f]{64}$'),
  invitee_user_id uuid REFERENCES users (id),
  channel text CHECK (channel IN ('wa', 'imsg', 'sms', 'ig', 'tg', 'mail', 'qr', 'copy', 'x', 'app')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'later', 'declined', 'claimed', 'waitlisted', 'expired', 'revoked')),
  waitlist_position integer CHECK (waitlist_position > 0),
  expires_at timestamptz NOT NULL,
  claimed_by uuid REFERENCES users (id),
  claimed_at timestamptz,
  nudged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invites_seat_token_matches_kind CHECK ((kind = 'personal') = (seat_token_hash IS NOT NULL))
);
CREATE UNIQUE INDEX invites_seat_token_hash_key ON invites (seat_token_hash) WHERE seat_token_hash IS NOT NULL;
CREATE INDEX invites_crew_id_status_idx ON invites (crew_id, status);
CREATE INDEX invites_trip_id_idx ON invites (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX invites_inviter_id_idx ON invites (inviter_id);
CREATE INDEX invites_invitee_user_id_idx ON invites (invitee_user_id) WHERE invitee_user_id IS NOT NULL;
CREATE INDEX invites_open_expiry_idx ON invites (expires_at) WHERE status IN ('pending', 'later', 'waitlisted');
CREATE TRIGGER invites_touch_updated_at BEFORE UPDATE ON invites
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE invites FORCE ROW LEVEL SECURITY;
CREATE POLICY invites_select ON invites FOR SELECT TO app_user
  USING (app.is_crew_member(crew_id) OR inviter_id = app.uid() OR invitee_user_id = app.uid());
CREATE POLICY invites_insert ON invites FOR INSERT TO app_user
  WITH CHECK (inviter_id = app.uid() AND app.is_crew_member(crew_id));
CREATE POLICY invites_update ON invites FOR UPDATE TO app_user
  USING (app.is_crew_member(crew_id) OR invitee_user_id = app.uid())
  WITH CHECK (app.is_crew_member(crew_id) OR invitee_user_id = app.uid());
CREATE POLICY invites_system ON invites FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON invites TO app_user;
-- A crew that invited someone in-app shows them its header (name, art) while the invite is open.
CREATE POLICY crews_invitee_read ON crews FOR SELECT TO app_user
  USING (EXISTS (SELECT 1 FROM invites i
                  WHERE i.crew_id = crews.id AND i.invitee_user_id = app.uid()
                    AND i.status IN ('pending', 'later')));
GRANT UPDATE (status, waitlist_position, claimed_by, claimed_at) ON invites TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON invites TO app_system;

-- invite_opens: RLS class O on the inviter. Bot-filtered opens of a personal link are the
-- inviter's to see, never the crew's, so they live apart from the crew-visible invite row.
CREATE TABLE invite_opens (
  id uuid PRIMARY KEY REFERENCES invites (id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES users (id),
  open_count integer NOT NULL DEFAULT 0 CHECK (open_count >= 0),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invite_opens_inviter_id_idx ON invite_opens (inviter_id);
CREATE TRIGGER invite_opens_touch_updated_at BEFORE UPDATE ON invite_opens
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE invite_opens ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_opens FORCE ROW LEVEL SECURITY;
CREATE POLICY invite_opens_owner_read ON invite_opens FOR SELECT TO app_user
  USING (inviter_id = app.uid());
CREATE POLICY invite_opens_system ON invite_opens FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON invite_opens TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON invite_opens TO app_system;

-- invite_prefill: RLS class X (C3). The inviter writes it once, through the command; nobody reads
-- it back through app_user. Name and note are AES-GCM envelopes (packages/db/src/crypto), the phone
-- is only ever an HMAC for matching. Purged 7 days after its invite is claimed or expires.
CREATE TABLE invite_prefill (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  invite_id uuid NOT NULL UNIQUE REFERENCES invites (id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES users (id),
  name_enc text,
  home_hint text CHECK (home_hint ~ '^[A-Z]{3}$'),
  tags text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 3),
  inviter_note_enc text,
  phone_hash text CHECK (phone_hash ~ '^[0-9a-f]{64}$'),
  provenance text NOT NULL DEFAULT 'contacts' CHECK (provenance IN ('contacts', 'typed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invite_prefill_phone_hash_idx ON invite_prefill (phone_hash) WHERE phone_hash IS NOT NULL;
ALTER TABLE invite_prefill ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_prefill FORCE ROW LEVEL SECURITY;
CREATE POLICY invite_prefill_inviter_insert ON invite_prefill FOR INSERT TO app_user
  WITH CHECK (
    inviter_id = app.uid()
    AND EXISTS (SELECT 1 FROM invites i WHERE i.id = invite_id AND i.inviter_id = app.uid())
  );
CREATE POLICY invite_prefill_system ON invite_prefill FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT INSERT ON invite_prefill TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON invite_prefill TO app_system;

-- referrals: RLS class O for either party (status only), system-written.
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  referrer_id uuid NOT NULL REFERENCES users (id),
  referee_id uuid NOT NULL UNIQUE REFERENCES users (id),
  code text,
  invite_id uuid REFERENCES invites (id) ON DELETE SET NULL,
  via text NOT NULL CHECK (via IN ('invite', 'code', 'referral_link')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'joined', 'qualified', 'void')),
  void_reason text,
  qualified_at timestamptz,
  reward_kind text CHECK (reward_kind IN ('stamp')),
  reward_ref uuid,
  -- The install the referee attributed from: fraud checks only, never readable by either party.
  referee_device_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referrals_not_self CHECK (referrer_id <> referee_id)
);
CREATE INDEX referrals_referrer_id_idx ON referrals (referrer_id, status);
CREATE TRIGGER referrals_touch_updated_at BEFORE UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals FORCE ROW LEVEL SECURITY;
CREATE POLICY referrals_party_read ON referrals FOR SELECT TO app_user
  USING (referrer_id = app.uid() OR referee_id = app.uid());
CREATE POLICY referrals_system ON referrals FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT (id, referrer_id, referee_id, code, invite_id, via, status, void_reason, qualified_at,
  reward_kind, reward_ref, created_at, updated_at) ON referrals TO app_user;
GRANT SELECT, INSERT, UPDATE ON referrals TO app_system;

-- seat_waitlist_offers: RLS class T. The system offers a freed seat to the next waitlisted
-- participant; only that participant answers it. Never an auto-join.
CREATE TABLE seat_waitlist_offers (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  invite_id uuid REFERENCES invites (id) ON DELETE SET NULL,
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'accepted', 'declined', 'expired')),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seat_waitlist_offers_window CHECK (expires_at > offered_at)
);
CREATE UNIQUE INDEX seat_waitlist_offers_one_open_key ON seat_waitlist_offers (trip_id, user_id)
  WHERE status = 'offered';
CREATE INDEX seat_waitlist_offers_trip_status_idx ON seat_waitlist_offers (trip_id, status);
CREATE INDEX seat_waitlist_offers_open_expiry_idx ON seat_waitlist_offers (expires_at) WHERE status = 'offered';
CREATE TRIGGER seat_waitlist_offers_touch_updated_at BEFORE UPDATE ON seat_waitlist_offers
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE seat_waitlist_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_waitlist_offers FORCE ROW LEVEL SECURITY;
CREATE POLICY seat_waitlist_offers_select ON seat_waitlist_offers FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY seat_waitlist_offers_self_answer ON seat_waitlist_offers FOR UPDATE TO app_user
  USING (user_id = app.uid() AND app.is_trip_member(trip_id))
  WITH CHECK (user_id = app.uid() AND app.is_trip_member(trip_id));
CREATE POLICY seat_waitlist_offers_system ON seat_waitlist_offers FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON seat_waitlist_offers TO app_user;
GRANT UPDATE (status, responded_at) ON seat_waitlist_offers TO app_user;
-- DELETE is for account merge only: an anonymous uid's offer that collides with the surviving
-- account's offer on the same trip is dropped before the rest are reassigned.
GRANT SELECT, INSERT, UPDATE, DELETE ON seat_waitlist_offers TO app_system;

-- crew_contact_cards: RLS class M, written by the system only while the member's
-- crew_phone_visible consent stands, deleted on revoke.
CREATE TABLE crew_contact_cards (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  user_id uuid NOT NULL REFERENCES users (id),
  phone_display text NOT NULL CHECK (char_length(phone_display) BETWEEN 4 AND 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (crew_id, user_id)
);
CREATE INDEX crew_contact_cards_user_id_idx ON crew_contact_cards (user_id);
CREATE TRIGGER crew_contact_cards_touch_updated_at BEFORE UPDATE ON crew_contact_cards
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE crew_contact_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_contact_cards FORCE ROW LEVEL SECURITY;
CREATE POLICY crew_contact_cards_member_read ON crew_contact_cards FOR SELECT TO app_user
  USING (app.is_crew_member(crew_id));
CREATE POLICY crew_contact_cards_system ON crew_contact_cards FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON crew_contact_cards TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON crew_contact_cards TO app_system;

-- ---------------------------------------------------------------------------------------------
-- Who may manage a crew's members: a crew organiser, the crew's creator, or an organiser of one of
-- its live trips (not cancelled or archived). The crew_members update policy widens to them.
CREATE OR REPLACE FUNCTION app.can_manage_crew_members(crew uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT app.is_crew_member(crew) AND (
    app.is_crew_organiser(crew)
    OR EXISTS (SELECT 1 FROM crews c WHERE c.id = crew AND c.created_by = app.uid())
    OR EXISTS (
      SELECT 1 FROM trips t JOIN trip_participants tp ON tp.trip_id = t.id
       WHERE t.crew_id = crew AND t.status NOT IN ('cancelled', 'archived')
         AND tp.user_id = app.uid() AND tp.role = 'organiser'
    )
  )
$$;
REVOKE EXECUTE ON FUNCTION app.can_manage_crew_members(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_manage_crew_members(uuid) TO app_user, app_system;

DROP POLICY crew_members_update ON crew_members;
CREATE POLICY crew_members_update ON crew_members FOR UPDATE TO app_user
  USING (user_id = app.uid() OR app.can_manage_crew_members(crew_id))
  WITH CHECK (user_id = app.uid() OR app.can_manage_crew_members(crew_id));

-- Mints a crew, trip or referral code for the caller, optionally retiring that destination's live
-- codes first (rotation). Crew and trip codes need an active membership of the crew; a referral
-- code only ever points at its own creator. A value colliding with a live code raises
-- unique_violation and the caller draws again.
CREATE OR REPLACE FUNCTION app.issue_join_code(
  p_code text, p_kind text, p_ref uuid, p_expires_at timestamptz,
  p_max_uses integer, p_rotate boolean
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, app AS $$
DECLARE
  caller uuid := app.uid();
  code_crew uuid;
  new_id uuid;
BEGIN
  IF caller IS NULL THEN
    RAISE EXCEPTION 'issue_join_code needs a caller' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_kind = 'crew' THEN
    code_crew := p_ref;
  ELSIF p_kind = 'trip' THEN
    SELECT t.crew_id INTO code_crew FROM trips t WHERE t.id = p_ref;
  ELSIF p_kind = 'referral' THEN
    IF p_ref <> caller THEN
      RAISE EXCEPTION 'a referral code points at its creator' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    RAISE EXCEPTION 'unknown join code kind %', p_kind USING ERRCODE = 'check_violation';
  END IF;
  IF p_kind <> 'referral' AND (code_crew IS NULL OR NOT app.is_crew_member(code_crew)) THEN
    RAISE EXCEPTION 'not a member of the code''s crew' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_rotate THEN
    UPDATE join_codes jc SET status = 'revoked'
     WHERE jc.target_kind = p_kind AND jc.target_id = p_ref AND jc.status = 'active';
  END IF;
  INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by, expires_at, max_uses)
  VALUES (p_code, p_kind, p_ref, code_crew, caller, p_expires_at, p_max_uses)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.issue_join_code(text, text, uuid, timestamptz, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.issue_join_code(text, text, uuid, timestamptz, integer, boolean) TO app_user;

-- Counts one use of the live code with this value (anyone holding a code may use it); false when
-- no live code has it. Marks the code exhausted on its last use.
CREATE OR REPLACE FUNCTION app.redeem_join_code(p_code text) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  WITH used AS (
    UPDATE join_codes
       SET uses = uses + 1,
           status = CASE WHEN max_uses IS NOT NULL AND uses + 1 >= max_uses THEN 'exhausted' ELSE status END
     WHERE code = p_code AND status = 'active'
       AND (expires_at IS NULL OR expires_at > now())
       AND (max_uses IS NULL OR uses < max_uses)
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM used)
$$;
REVOKE EXECUTE ON FUNCTION app.redeem_join_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.redeem_join_code(text) TO app_user, app_system;

-- Serialises joins to one crew: locks the crew row for the rest of the transaction and reports
-- its active headcount against its ceiling. Lock order everywhere is crew, then trip.
CREATE OR REPLACE FUNCTION app.lock_crew_membership(p_crew uuid)
RETURNS TABLE (active_members integer, member_ceiling integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  ceiling integer;
BEGIN
  SELECT c.member_ceiling INTO ceiling FROM crews c WHERE c.id = p_crew FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT (SELECT count(*)::integer FROM crew_members cm
             WHERE cm.crew_id = p_crew AND cm.status = 'active'), ceiling;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.lock_crew_membership(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_crew_membership(uuid) TO app_user, app_system;

-- Brings the caller's own former membership of a crew back to active (a rejoin through a new
-- invite). A former member cannot read their old row through RLS, so this runs as definer and
-- touches only the caller's row. False when there is no inactive row to revive.
CREATE OR REPLACE FUNCTION app.reactivate_membership(p_crew uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF app.uid() IS NULL THEN
    RETURN false;
  END IF;
  UPDATE crew_members SET status = 'active', role = 'member', keep_in_chat = false, left_at = NULL
   WHERE crew_id = p_crew AND user_id = app.uid() AND status <> 'active';
  RETURN FOUND;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.reactivate_membership(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reactivate_membership(uuid) TO app_user;

-- Serialises seat claims on one trip: locks the trip row for the rest of the transaction and
-- reports seats held, the cap (trip_entitlements, 6 until computed), open seat offers and the
-- last waitlist position. A user caller must be a member of the trip's crew.
CREATE OR REPLACE FUNCTION app.lock_trip_seats(p_trip uuid)
RETURNS TABLE (
  crew_id uuid, trip_status text, seats_held integer, seat_cap integer, boost_active boolean,
  open_offers integer, last_waitlist_position integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  trip_crew uuid;
  status_now text;
BEGIN
  SELECT t.crew_id, t.status INTO trip_crew, status_now FROM trips t WHERE t.id = p_trip FOR UPDATE;
  IF NOT FOUND OR (app.uid() IS NOT NULL AND NOT app.is_crew_member(trip_crew)) THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT
    trip_crew,
    status_now,
    (SELECT count(*)::integer FROM trip_participants tp WHERE tp.trip_id = p_trip AND tp.holds_seat),
    coalesce((SELECT te.seat_cap FROM trip_entitlements te WHERE te.trip_id = p_trip), 6),
    coalesce((SELECT te.boost_active FROM trip_entitlements te WHERE te.trip_id = p_trip), false),
    (SELECT count(*)::integer FROM seat_waitlist_offers o
      WHERE o.trip_id = p_trip AND o.status = 'offered' AND o.expires_at > now()),
    (SELECT max(tp.waitlist_position) FROM trip_participants tp
      WHERE tp.trip_id = p_trip AND tp.rsvp = 'waitlisted');
END;
$$;
REVOKE EXECUTE ON FUNCTION app.lock_trip_seats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_trip_seats(uuid) TO app_user, app_system;

-- The personal invite a seat token opens (looked up by the token's SHA-256), for whoever holds the
-- token: holding it is the authorisation. Prefill envelopes come back still encrypted; the api
-- decrypts only what the invitee is shown.
CREATE OR REPLACE FUNCTION app.invite_for_seat(p_seat_token_hash text)
RETURNS TABLE (
  invite_id uuid, crew_id uuid, trip_id uuid, inviter_id uuid, join_code_id uuid, status text,
  expires_at timestamptz, claimed_by uuid, phone_hash text, name_enc text, home_hint text,
  tags text[], provenance text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT i.id, i.crew_id, i.trip_id, i.inviter_id, i.join_code_id, i.status, i.expires_at,
         i.claimed_by, p.phone_hash, p.name_enc, p.home_hint, p.tags, p.provenance
    FROM invites i LEFT JOIN invite_prefill p ON p.invite_id = i.id
   WHERE i.seat_token_hash = p_seat_token_hash
$$;
REVOKE EXECUTE ON FUNCTION app.invite_for_seat(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.invite_for_seat(text) TO app_user, app_system;

-- A member leaving (or removed from) a crew leaves its live trips: every seat or waitlist place
-- they hold there goes to 'out' and their open seat offers lapse. Returns each released trip and
-- whether a real seat was freed. Callable for oneself, or by someone who manages the crew.
CREATE OR REPLACE FUNCTION app.release_member_trips(p_crew uuid, p_member uuid)
RETURNS TABLE (trip_id uuid, freed_seat boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF app.uid() IS NOT NULL AND p_member <> app.uid() AND NOT app.can_manage_crew_members(p_crew) THEN
    RAISE EXCEPTION 'may not release another member''s trips' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE seat_waitlist_offers o SET status = 'expired', responded_at = now()
    FROM trips t
   WHERE t.id = o.trip_id AND t.crew_id = p_crew AND o.user_id = p_member AND o.status = 'offered';
  RETURN QUERY
    WITH released AS (
      SELECT tp.id, tp.trip_id AS released_trip, tp.holds_seat AS held
        FROM trip_participants tp JOIN trips t ON t.id = tp.trip_id
       WHERE t.crew_id = p_crew AND tp.user_id = p_member AND tp.rsvp <> 'out'
         AND t.status NOT IN ('cancelled', 'archived')
       FOR UPDATE OF tp
    ), updated AS (
      UPDATE trip_participants tp SET rsvp = 'out', waitlist_position = NULL
        FROM released r WHERE tp.id = r.id
      RETURNING tp.id
    )
    SELECT r.released_trip, r.held FROM released r;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.release_member_trips(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.release_member_trips(uuid, uuid) TO app_user, app_system;

-- Organiser hand-off when someone leaves: on every live trip of the crew where they were the only
-- organiser, the longest-standing remaining seated participant becomes organiser; if they were the
-- crew's only organiser, the longest-standing remaining active member takes that role. A
-- co-organiser already holds the same powers, so nobody is promoted while one remains.
CREATE OR REPLACE FUNCTION app.hand_off_organiser(p_crew uuid, p_leaving uuid)
RETURNS TABLE (scope text, scope_id uuid, new_organiser uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  orphan record;
  successor uuid;
BEGIN
  IF app.uid() IS NOT NULL AND p_leaving <> app.uid() AND NOT app.can_manage_crew_members(p_crew) THEN
    RAISE EXCEPTION 'may not hand off another member''s roles' USING ERRCODE = 'insufficient_privilege';
  END IF;
  FOR orphan IN
    SELECT t.id FROM trips t
     WHERE t.crew_id = p_crew AND t.status NOT IN ('cancelled', 'archived')
       AND EXISTS (SELECT 1 FROM trip_participants tp
                    WHERE tp.trip_id = t.id AND tp.user_id = p_leaving AND tp.role = 'organiser')
       AND NOT EXISTS (SELECT 1 FROM trip_participants tp
                        WHERE tp.trip_id = t.id AND tp.user_id <> p_leaving
                          AND tp.role = 'organiser' AND tp.rsvp <> 'out')
  LOOP
    successor := NULL;
    SELECT tp.user_id INTO successor FROM trip_participants tp
      JOIN crew_members cm ON cm.crew_id = p_crew AND cm.user_id = tp.user_id AND cm.status = 'active'
     WHERE tp.trip_id = orphan.id AND tp.user_id <> p_leaving AND tp.rsvp NOT IN ('out', 'waitlisted')
     ORDER BY tp.created_at, tp.id LIMIT 1;
    IF successor IS NOT NULL THEN
      UPDATE trip_participants SET role = 'organiser' WHERE trip_id = orphan.id AND user_id = successor;
      scope := 'trip'; scope_id := orphan.id; new_organiser := successor;
      RETURN NEXT;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM crew_members WHERE crew_id = p_crew AND user_id = p_leaving AND role = 'organiser')
     AND NOT EXISTS (SELECT 1 FROM crew_members WHERE crew_id = p_crew AND user_id <> p_leaving
                        AND role = 'organiser' AND status = 'active') THEN
    successor := NULL;
    SELECT cm.user_id INTO successor FROM crew_members cm
     WHERE cm.crew_id = p_crew AND cm.user_id <> p_leaving AND cm.status = 'active'
     ORDER BY cm.created_at, cm.id LIMIT 1;
    IF successor IS NOT NULL THEN
      UPDATE crew_members SET role = 'organiser' WHERE crew_id = p_crew AND user_id = successor;
      scope := 'crew'; scope_id := p_crew; new_organiser := successor;
      RETURN NEXT;
    END IF;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.hand_off_organiser(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.hand_off_organiser(uuid, uuid) TO app_user, app_system;

-- Offers each free seat of a live trip to the next person waiting (lowest waitlist position
-- first, nobody with an open offer twice), for `p_window`. A free seat is one nobody holds and no
-- open offer promises; a trip whose boost ended with more than its cap seated has none. System
-- only: the waitlist sweep and the promote_waitlist system command call it. Mirrors
-- packages/domain/src/invites/seat-allocation.ts#offersToMake.
CREATE OR REPLACE FUNCTION app.offer_freed_seats(p_trip uuid, p_window interval)
RETURNS TABLE (offer_id uuid, offered_user uuid, offer_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  seats record;
  free integer;
BEGIN
  IF app.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'seat offers are made by the system' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO seats FROM app.lock_trip_seats(p_trip);
  IF seats.crew_id IS NULL OR seats.trip_status IN ('cancelled', 'archived', 'post_trip') THEN
    RETURN;
  END IF;
  free := greatest(0, seats.seat_cap - seats.seats_held - seats.open_offers);
  IF free = 0 THEN
    RETURN;
  END IF;
  RETURN QUERY
    INSERT INTO seat_waitlist_offers (trip_id, user_id, invite_id, expires_at)
    SELECT p_trip, tp.user_id,
           (SELECT i.id FROM invites i
             WHERE i.trip_id = p_trip AND i.claimed_by = tp.user_id AND i.status = 'waitlisted'
             ORDER BY i.claimed_at DESC LIMIT 1),
           now() + p_window
      FROM trip_participants tp
     WHERE tp.trip_id = p_trip AND tp.rsvp = 'waitlisted'
       AND NOT EXISTS (SELECT 1 FROM seat_waitlist_offers o
                        WHERE o.trip_id = p_trip AND o.user_id = tp.user_id AND o.status = 'offered')
     ORDER BY tp.waitlist_position NULLS LAST, tp.created_at, tp.id
     LIMIT free
    RETURNING id, user_id, expires_at;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.offer_freed_seats(uuid, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.offer_freed_seats(uuid, interval) TO app_system;

-- Lapses every open offer past its window: the offer expires and its holder goes to the back of
-- that trip's waitlist, so the seat passes to the next person. Returns the trips touched. System only.
CREATE OR REPLACE FUNCTION app.expire_seat_offers(p_now timestamptz)
RETURNS TABLE (lapsed_trip uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  lapsed record;
BEGIN
  IF app.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'seat offers are lapsed by the system' USING ERRCODE = 'insufficient_privilege';
  END IF;
  FOR lapsed IN
    UPDATE seat_waitlist_offers SET status = 'expired'
     WHERE status = 'offered' AND expires_at <= p_now
    RETURNING trip_id, user_id
  LOOP
    PERFORM 1 FROM trips WHERE id = lapsed.trip_id FOR UPDATE;
    UPDATE trip_participants tp
       SET waitlist_position = (SELECT coalesce(max(w.waitlist_position), 0) + 1
                                  FROM trip_participants w
                                 WHERE w.trip_id = lapsed.trip_id AND w.rsvp = 'waitlisted')
     WHERE tp.trip_id = lapsed.trip_id AND tp.user_id = lapsed.user_id AND tp.rsvp = 'waitlisted';
    lapsed_trip := lapsed.trip_id;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.expire_seat_offers(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.expire_seat_offers(timestamptz) TO app_system;

-- Records the caller's referral (first link or code wins; later ones change nothing). The caller
-- is always the referee, so nobody can attribute someone else. Returns the new referral's id, or
-- NULL when the caller already has one. Eligibility (a new account, not oneself) is checked by the
-- command with packages/domain/src/referrals/qualification.ts#canAttributeReferral.
CREATE OR REPLACE FUNCTION app.record_referral(
  p_referrer uuid, p_via text, p_status text, p_invite uuid, p_code text, p_device uuid
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  new_id uuid;
BEGIN
  IF app.uid() IS NULL OR p_referrer = app.uid() THEN
    RETURN NULL;
  END IF;
  INSERT INTO referrals (referrer_id, referee_id, via, status, invite_id, code, referee_device_id)
  VALUES (p_referrer, app.uid(), p_via, p_status, p_invite, p_code, p_device)
  ON CONFLICT (referee_id) DO NOTHING
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.record_referral(uuid, text, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.record_referral(uuid, text, text, uuid, text, uuid) TO app_user;

-- Who minted a live code, for referral attribution inside a join (never returned to a client).
CREATE OR REPLACE FUNCTION app.join_code_creator(p_code text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT created_by FROM join_codes WHERE code = p_code AND status = 'active'
$$;
REVOKE EXECUTE ON FUNCTION app.join_code_creator(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.join_code_creator(text) TO app_user;

-- ---------------------------------------------------------------------------------------------
-- domain_events: crew growth events join the catalogue (packages/domain/src/crews/events.ts).
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
  'invite.nudged', 'trip.seat_opened', 'seat_offer.accepted', 'referral.progressed'
));

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList. invite_prefill (C3) stays out.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY['invites', 'invite_opens', 'referrals', 'seat_waitlist_offers', 'crew_contact_cards'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON invites, invite_opens, referrals, seat_waitlist_offers, crew_contact_cards TO powersync_repl;
