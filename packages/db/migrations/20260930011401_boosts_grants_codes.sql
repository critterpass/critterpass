-- Trip Boost, first trip free, crew yearly and codes (docs/data-model.md §3.14,
-- docs/data-model-sync-and-privacy.md §3.3). A boost is bought for one trip after its buyer takes
-- the trip's intent lock; its window runs to the trip's end + 7 days; a cancelled trip moves it to
-- the crew's next trip or leaves a credit that never expires. A split boost is an expense with
-- `boost_iou` ledger entries, nothing more: IOUs never gate a perk.
--
-- Everything here is written by the server. Crew members read the crew's boosts, grants and
-- credits (and they sync); codes are system-only; a member reads their own code redemptions.

-- ---------------------------------------------------------------------------------------------
-- boost_intents: RLS class T (C1). A member's lock on buying a boost for a trip (15 minutes): at
-- most one open or purchasing intent per trip, so two members can never pay for the same trip.
CREATE TABLE boost_intents (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  crew_id uuid NOT NULL REFERENCES crews (id),
  buyer_id uuid NOT NULL REFERENCES users (id),
  product_key text NOT NULL CHECK (product_key IN ('boost_trip', 'boost_crew_year')),
  split_mode text NOT NULL CHECK (split_mode IN ('cover', 'split')),
  split_member_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'purchasing', 'fulfilled', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A split names its members, the buyer among them; covering names nobody.
  CHECK ((split_mode = 'split') = (cardinality(split_member_ids) >= 2)),
  CHECK (split_mode = 'cover' OR buyer_id = ANY (split_member_ids))
);
CREATE UNIQUE INDEX boost_intents_trip_lock_uk ON boost_intents (trip_id)
  WHERE status IN ('open', 'purchasing');
CREATE INDEX boost_intents_crew_id_idx ON boost_intents (crew_id);
CREATE INDEX boost_intents_buyer_id_idx ON boost_intents (buyer_id);
CREATE TRIGGER boost_intents_touch_updated_at BEFORE UPDATE ON boost_intents
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- crew_year_grants: RLS class M (C2). The crew yearly boost: bound to one crew at purchase,
-- renewed with the buyer's subscription, rebound to another crew at most once per period.
CREATE TABLE crew_year_grants (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  buyer_id uuid NOT NULL REFERENCES users (id),
  subscription_id uuid REFERENCES subscriptions (id),
  original_transaction_id text CHECK (char_length(original_transaction_id) <= 200),
  valid_from timestamptz NOT NULL,
  valid_to timestamptz NOT NULL,
  -- The period end the last rebind happened in; a rebind is allowed while this is not valid_to.
  rebound_for_period_end timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to > valid_from)
);
CREATE UNIQUE INDEX crew_year_grants_subscription_uk ON crew_year_grants (subscription_id)
  WHERE subscription_id IS NOT NULL;
CREATE INDEX crew_year_grants_crew_id_idx ON crew_year_grants (crew_id);
CREATE INDEX crew_year_grants_buyer_id_idx ON crew_year_grants (buyer_id);
CREATE TRIGGER crew_year_grants_touch_updated_at BEFORE UPDATE ON crew_year_grants
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- trip_boosts: RLS class T (C1). Every boost a trip has had: bought, first trip free, moved from a
-- cancelled trip, or granted by support. At most one live (scheduled or active) boost per trip;
-- one row per store transaction, so a purchase activates once however many times it is reported.
CREATE TABLE trip_boosts (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  crew_id uuid NOT NULL REFERENCES crews (id),
  buyer_id uuid REFERENCES users (id),
  source text NOT NULL
    CHECK (source IN ('purchase', 'first_trip_free', 'crew_year', 'moved', 'promo')),
  store_transaction_id uuid REFERENCES store_transactions (id),
  intent_id uuid REFERENCES boost_intents (id),
  crew_year_grant_id uuid REFERENCES crew_year_grants (id),
  split_mode text NOT NULL DEFAULT 'cover' CHECK (split_mode IN ('cover', 'split')),
  split_member_ids uuid[] NOT NULL DEFAULT '{}',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('scheduled', 'active', 'ended', 'moved', 'revoked', 'credit')),
  moved_from_trip_id uuid REFERENCES trips (id),
  moved_from_boost_id uuid REFERENCES trip_boosts (id),
  expense_id uuid REFERENCES expenses (id),
  thanked_by uuid[] NOT NULL DEFAULT '{}',
  revoked_at timestamptz,
  revoke_reason text CHECK (revoke_reason IN ('refund', 'revoke')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK ((source = 'purchase') = (store_transaction_id IS NOT NULL)),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX trip_boosts_live_uk ON trip_boosts (trip_id)
  WHERE status IN ('scheduled', 'active');
CREATE UNIQUE INDEX trip_boosts_transaction_uk ON trip_boosts (store_transaction_id)
  WHERE store_transaction_id IS NOT NULL;
CREATE INDEX trip_boosts_trip_status_idx ON trip_boosts (trip_id, status);
CREATE INDEX trip_boosts_crew_id_idx ON trip_boosts (crew_id);
CREATE INDEX trip_boosts_buyer_id_idx ON trip_boosts (buyer_id) WHERE buyer_id IS NOT NULL;
CREATE INDEX trip_boosts_intent_id_idx ON trip_boosts (intent_id) WHERE intent_id IS NOT NULL;
CREATE INDEX trip_boosts_crew_year_grant_id_idx ON trip_boosts (crew_year_grant_id)
  WHERE crew_year_grant_id IS NOT NULL;
CREATE INDEX trip_boosts_moved_from_trip_id_idx ON trip_boosts (moved_from_trip_id)
  WHERE moved_from_trip_id IS NOT NULL;
CREATE INDEX trip_boosts_moved_from_boost_id_idx ON trip_boosts (moved_from_boost_id)
  WHERE moved_from_boost_id IS NOT NULL;
CREATE INDEX trip_boosts_expense_id_idx ON trip_boosts (expense_id) WHERE expense_id IS NOT NULL;
CREATE TRIGGER trip_boosts_touch_updated_at BEFORE UPDATE ON trip_boosts
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- The boost machine (packages/domain/src/billing/states.ts TRIP_BOOST_TRANSITIONS): moved, credit
-- and revoked are final; an ended boost comes back only when its trip's dates move out, and a
-- refund after the window still revokes it.
CREATE OR REPLACE FUNCTION app.trip_boosts_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF (OLD.status, NEW.status) IN (
    ('scheduled', 'active'), ('scheduled', 'moved'), ('scheduled', 'credit'),
    ('scheduled', 'revoked'), ('active', 'ended'), ('active', 'moved'), ('active', 'credit'),
    ('active', 'revoked'), ('ended', 'active'), ('ended', 'revoked')
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'trip boost cannot move from % to %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$;
REVOKE EXECUTE ON FUNCTION app.trip_boosts_transition() FROM PUBLIC;
CREATE TRIGGER trip_boosts_transition BEFORE UPDATE OF status ON trip_boosts
  FOR EACH ROW EXECUTE FUNCTION app.trip_boosts_transition();

-- A boost's split is an expense the boost points back at.
ALTER TABLE expenses ADD CONSTRAINT expenses_boost_id_fkey
  FOREIGN KEY (boost_id) REFERENCES trip_boosts (id);
CREATE INDEX expenses_boost_id_idx ON expenses (boost_id) WHERE boost_id IS NOT NULL;
ALTER TABLE store_transactions ADD CONSTRAINT store_transactions_boost_intent_id_fkey
  FOREIGN KEY (boost_intent_id) REFERENCES boost_intents (id);
CREATE INDEX store_transactions_boost_intent_id_idx ON store_transactions (boost_intent_id)
  WHERE boost_intent_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- boost_credits: RLS class M / O (C2). A boost with nowhere to go (its trip was cancelled with no
-- later trip, or a second purchase for an already boosted trip). Credits never expire; any member
-- of the crew spends one on a trip.
CREATE TABLE boost_credits (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid REFERENCES crews (id),
  user_id uuid REFERENCES users (id),
  reason text NOT NULL CHECK (reason IN ('trip_cancelled', 'duplicate_purchase')),
  from_boost_id uuid REFERENCES trip_boosts (id),
  store_transaction_id uuid REFERENCES store_transactions (id),
  expires_at timestamptz,
  consumed_by_boost_id uuid REFERENCES trip_boosts (id),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (crew_id IS NOT NULL OR user_id IS NOT NULL),
  CHECK ((consumed_by_boost_id IS NULL) = (consumed_at IS NULL))
);
CREATE INDEX boost_credits_crew_id_idx ON boost_credits (crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX boost_credits_user_id_idx ON boost_credits (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX boost_credits_from_boost_uk ON boost_credits (from_boost_id)
  WHERE from_boost_id IS NOT NULL;
CREATE UNIQUE INDEX boost_credits_transaction_uk ON boost_credits (store_transaction_id)
  WHERE store_transaction_id IS NOT NULL;
CREATE INDEX boost_credits_consumed_by_idx ON boost_credits (consumed_by_boost_id)
  WHERE consumed_by_boost_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- ftf_grants: RLS class M (C2). A crew's first trip free: once per crew, for its first trip with
-- two or more seated members, Boost + Pass+ for every member until trip end + 7 days.
-- `member_overlap_hash` fingerprints the seated member set so ops can spot a crew re-formed to
-- claim it again; the organiser's abuse keys live in ops.ftf_abuse_keys, never in a synced row.
CREATE TABLE ftf_grants (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL UNIQUE REFERENCES crews (id),
  trip_id uuid NOT NULL UNIQUE REFERENCES trips (id),
  organiser_id uuid NOT NULL REFERENCES users (id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  member_overlap_hash text NOT NULL CHECK (char_length(member_overlap_hash) = 64),
  abuse_decision text NOT NULL DEFAULT 'allowed'
    CHECK (abuse_decision IN ('allowed', 'review', 'revoked')),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX ftf_grants_organiser_id_idx ON ftf_grants (organiser_id);
CREATE INDEX ftf_grants_overlap_idx ON ftf_grants (member_overlap_hash);
CREATE INDEX ftf_grants_review_idx ON ftf_grants (created_at) WHERE abuse_decision = 'review';
CREATE TRIGGER ftf_grants_touch_updated_at BEFORE UPDATE ON ftf_grants
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- One first trip free per organiser account, verified phone and attested device, forever: a
-- revoked grant keeps its keys.
CREATE TABLE ops.ftf_abuse_keys (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  grant_id uuid NOT NULL REFERENCES ftf_grants (id),
  kind text NOT NULL CHECK (kind IN ('account', 'phone', 'device')),
  key_hash text NOT NULL CHECK (char_length(key_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, key_hash)
);
CREATE INDEX ftf_abuse_keys_grant_id_idx ON ops.ftf_abuse_keys (grant_id);
ALTER TABLE ops.ftf_abuse_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.ftf_abuse_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY ftf_abuse_keys_system ON ops.ftf_abuse_keys FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY ftf_abuse_keys_admin_reader ON ops.ftf_abuse_keys FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT, INSERT ON ops.ftf_abuse_keys TO app_system;
GRANT SELECT ON ops.ftf_abuse_keys TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- codes: RLS class S (C2). Gift codes funded by a gift purchase, and promo/partner codes. Only the
-- HMAC of a code is stored; its prefix is kept for support lookups.
CREATE TABLE codes (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  code_hash text NOT NULL UNIQUE CHECK (char_length(code_hash) = 64),
  code_prefix text NOT NULL CHECK (char_length(code_prefix) BETWEEN 1 AND 16),
  kind text NOT NULL CHECK (kind IN ('gift', 'promo', 'partner')),
  grant_spec jsonb NOT NULL CHECK (jsonb_typeof(grant_spec) = 'object'),
  sender_id uuid REFERENCES users (id),
  message text CHECK (char_length(message) <= 280),
  funded_by_txn_id uuid REFERENCES store_transactions (id),
  partner_id text CHECK (char_length(partner_id) <= 80),
  platform_restriction text NOT NULL DEFAULT 'any'
    CHECK (platform_restriction IN ('any', 'app_store', 'play')),
  max_redemptions integer NOT NULL DEFAULT 1 CHECK (max_redemptions >= 1),
  redeemed_count integer NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'redeemed', 'expired', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (redeemed_count <= max_redemptions),
  CHECK (kind <> 'gift' OR funded_by_txn_id IS NOT NULL)
);
CREATE INDEX codes_sender_id_idx ON codes (sender_id) WHERE sender_id IS NOT NULL;
CREATE UNIQUE INDEX codes_funded_by_txn_uk ON codes (funded_by_txn_id)
  WHERE funded_by_txn_id IS NOT NULL;
CREATE TRIGGER codes_touch_updated_at BEFORE UPDATE ON codes
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE store_transactions ADD CONSTRAINT store_transactions_code_id_fkey
  FOREIGN KEY (code_id) REFERENCES codes (id);
CREATE INDEX store_transactions_code_id_idx ON store_transactions (code_id) WHERE code_id IS NOT NULL;

-- code_redemptions: RLS class O (C2). Who redeemed which code, how it applied and to when; a user
-- redeems a code at most once.
CREATE TABLE code_redemptions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  code_id uuid NOT NULL REFERENCES codes (id),
  user_id uuid NOT NULL REFERENCES users (id),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  applied_as text NOT NULL CHECK (applied_as IN ('server_grant', 'store_extension', 'offer_code')),
  starts_at timestamptz NOT NULL,
  new_period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code_id, user_id),
  CHECK (new_period_end > starts_at)
);
CREATE INDEX code_redemptions_user_id_idx ON code_redemptions (user_id);

-- ops.offer_code_batches: partner App Store Offer Code / Play promo code batches support created
-- in the store consoles, recorded for audit; redemptions are counted from store transactions that
-- carry the batch's offer reference.
CREATE TABLE ops.offer_code_batches (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 120),
  platform text NOT NULL CHECK (platform IN ('app_store', 'play')),
  offer_ref text NOT NULL CHECK (char_length(offer_ref) BETWEEN 1 AND 200),
  size integer NOT NULL CHECK (size BETWEEN 1 AND 1000000),
  notes text CHECK (char_length(notes) <= 1000),
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX offer_code_batches_offer_ref_idx ON ops.offer_code_batches (offer_ref);
ALTER TABLE ops.offer_code_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.offer_code_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY offer_code_batches_system ON ops.offer_code_batches FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY offer_code_batches_admin_reader ON ops.offer_code_batches FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT, INSERT ON ops.offer_code_batches TO app_system;
GRANT SELECT ON ops.offer_code_batches TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- Row-level security: the crew reads its boosts, grants and credits; a buyer keeps reading the
-- boosts, credits and crew yearly grant they paid for after leaving; codes are the server's.
ALTER TABLE boost_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE boost_intents FORCE ROW LEVEL SECURITY;
CREATE POLICY boost_intents_select ON boost_intents FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id) OR buyer_id = app.uid());
CREATE POLICY boost_intents_system ON boost_intents FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON boost_intents TO app_user;
GRANT SELECT, INSERT, UPDATE ON boost_intents TO app_system;

ALTER TABLE trip_boosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_boosts FORCE ROW LEVEL SECURITY;
CREATE POLICY trip_boosts_select ON trip_boosts FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id) OR buyer_id = app.uid());
CREATE POLICY trip_boosts_system ON trip_boosts FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON trip_boosts TO app_user;
GRANT SELECT, INSERT, UPDATE ON trip_boosts TO app_system;

ALTER TABLE boost_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE boost_credits FORCE ROW LEVEL SECURITY;
CREATE POLICY boost_credits_select ON boost_credits FOR SELECT TO app_user
  USING ((crew_id IS NOT NULL AND app.is_crew_member(crew_id)) OR user_id = app.uid());
CREATE POLICY boost_credits_system ON boost_credits FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON boost_credits TO app_user;
GRANT SELECT, INSERT, UPDATE ON boost_credits TO app_system;

ALTER TABLE crew_year_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_year_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY crew_year_grants_select ON crew_year_grants FOR SELECT TO app_user
  USING (app.is_crew_member(crew_id) OR buyer_id = app.uid());
CREATE POLICY crew_year_grants_system ON crew_year_grants FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON crew_year_grants TO app_user;
GRANT SELECT, INSERT, UPDATE ON crew_year_grants TO app_system;

ALTER TABLE ftf_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ftf_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY ftf_grants_select ON ftf_grants FOR SELECT TO app_user
  USING (app.is_crew_member(crew_id));
CREATE POLICY ftf_grants_system ON ftf_grants FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON ftf_grants TO app_user;
GRANT SELECT, INSERT, UPDATE ON ftf_grants TO app_system;

ALTER TABLE codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE codes FORCE ROW LEVEL SECURITY;
CREATE POLICY codes_system ON codes FOR ALL TO app_system USING (true) WITH CHECK (true);
REVOKE ALL ON codes FROM app_user, guide_reader;
GRANT SELECT, INSERT, UPDATE ON codes TO app_system;

ALTER TABLE code_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_redemptions FORCE ROW LEVEL SECURITY;
CREATE POLICY code_redemptions_select ON code_redemptions FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY code_redemptions_system ON code_redemptions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON code_redemptions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON code_redemptions TO app_system;

-- Ops console reads.
GRANT SELECT (buyer_id, created_at, crew_id, expires_at, id, product_key, split_member_ids,
  split_mode, status, trip_id, updated_at) ON boost_intents TO admin_reader;
CREATE POLICY boost_intents_admin_reader ON boost_intents FOR SELECT TO admin_reader USING (true);
GRANT SELECT (buyer_id, created_at, crew_id, crew_year_grant_id, ends_at, expense_id, id, intent_id,
  moved_from_boost_id, moved_from_trip_id, revoke_reason, revoked_at, source, split_member_ids,
  split_mode, starts_at, status, store_transaction_id, thanked_by, trip_id, updated_at) ON
  trip_boosts TO admin_reader;
CREATE POLICY trip_boosts_admin_reader ON trip_boosts FOR SELECT TO admin_reader USING (true);
GRANT SELECT (consumed_at, consumed_by_boost_id, created_at, crew_id, expires_at, from_boost_id, id,
  reason, store_transaction_id, user_id) ON boost_credits TO admin_reader;
CREATE POLICY boost_credits_admin_reader ON boost_credits FOR SELECT TO admin_reader USING (true);
GRANT SELECT (buyer_id, created_at, crew_id, id, original_transaction_id, rebound_for_period_end,
  revoked_at, subscription_id, updated_at, valid_from, valid_to) ON crew_year_grants TO
  admin_reader;
CREATE POLICY crew_year_grants_admin_reader ON crew_year_grants FOR SELECT TO admin_reader USING (true);
GRANT SELECT (abuse_decision, created_at, crew_id, ends_at, id, member_overlap_hash, organiser_id,
  reviewed_at, starts_at, trip_id, updated_at) ON ftf_grants TO admin_reader;
CREATE POLICY ftf_grants_admin_reader ON ftf_grants FOR SELECT TO admin_reader USING (true);
GRANT SELECT (code_hash, code_prefix, created_at, expires_at, funded_by_txn_id, grant_spec, id,
  kind, max_redemptions, message, partner_id, platform_restriction, redeemed_count, sender_id,
  status, updated_at) ON codes TO admin_reader;
CREATE POLICY codes_admin_reader ON codes FOR SELECT TO admin_reader USING (true);
GRANT SELECT (applied_as, code_id, created_at, id, new_period_end, redeemed_at, starts_at, user_id)
  ON code_redemptions TO admin_reader;
CREATE POLICY code_redemptions_admin_reader ON code_redemptions FOR SELECT TO admin_reader USING (true);

-- ---------------------------------------------------------------------------------------------
-- domain_events: the billing events join the catalogue (packages/domain/src/billing/events.ts).
ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (
  'crew.member_joined', 'crew.member_left', 'crew.member_removed', 'trip.created',
  'trip.status_changed', 'plan.version_created', 'change_set.proposed', 'change_set.applied',
  'change_set.reverted', 'change_set.rejected', 'rsvp.changed', 'auth.merged', 'invite.opened',
  'attribution.claimed', 'guide_action.undone', 'fare.dropped', 'forecast.changed',
  'hazard.changed', 'moderation.decided', 'entitlement.granted', 'entitlement.revoked',
  'device.permissions_changed', 'visit.recorded', 'pass.issued', 'profile.updated',
  'profile.taste_changed', 'profile.avatar_changed', 'crew.created', 'crew.updated',
  'crew.code_rotated', 'user.active_crew_changed', 'invite.created', 'invite.claimed',
  'invite.deferred', 'invite.declined', 'invite.revoked', 'invite.nudged', 'trip.seat_opened',
  'seat_offer.accepted', 'referral.progressed', 'chat.message_sent', 'chat.message_edited',
  'chat.message_deleted', 'chat.reaction_changed', 'chat.guide_mentioned', 'inbox.item_resolved',
  'inbox.read', 'nudge.sent', 'nudge.received', 'tip.created', 'tip.dismissed',
  'trip.dates_changed', 'trip.destination_set', 'booking.flight_added', 'booking.flight_changed',
  'booking.flight_removed', 'user.tz_changed', 'location_share.changed', 'meetup.created',
  'meetup.moved', 'meetup.crew_close', 'crew.pinged', 'poll.created', 'poll.candidate_added',
  'poll.candidate_removed', 'poll.stage_changed', 'poll.closed', 'poll.cancelled',
  'poll.reveal_seen', 'poll.lead_changed', 'poll.closing_soon', 'poll.pick_needed', 'ballot.cast',
  'ballot.changed', 'ballot.retracted', 'pitch.created', 'pitch.queued', 'place.saved',
  'place.unsaved', 'availability.updated', 'calendar.connected', 'calendar.disconnected',
  'calendar.stale', 'availability_ask.created', 'availability_ask.answered',
  'availability_ask.timed_out', 'setup.step_changed', 'budget.submission_counted', 'budget.locked',
  'rooms.changed', 'rooms.locked', 'room_swap.requested', 'stay.chosen', 'must_dos.changed',
  'must_do.fit_checked', 'must_do.prompted', 'lottery.tracked', 'lottery.reminder_due',
  'draft.requested', 'draft.ready', 'draft.failed', 'draft.cancelled', 'draft.version_restored',
  'redraft.requested', 'redraft.delivered', 'redraft.kept', 'redraft.reverted', 'expense.added',
  'expense.edited', 'expense.deleted', 'crew.settlement_currency_changed', 'budget.target_changed',
  'payment.requested', 'payment.nudged', 'payment.marked_paid', 'payment.confirmed',
  'payment.disputed', 'payment.reminded', 'trip.settled', 'profile.payout_set', 'receipt.parsed',
  'booking.added', 'booking.edited', 'booking.deleted', 'booking.visibility_changed',
  'booking.deadline_due', 'import.requested', 'import.candidate_created', 'import.resolved',
  'import.quarantined', 'import.sender_linked', 'crew.inbound_rotated', 'mailbox.connected',
  'mailbox.disconnected', 'flight.watch_started', 'flight.status_changed', 'flight.boarding_open',
  'flight.landed', 'insurance.saved', 'insurance.deleted', 'insurance.shared',
  'boost.intent_locked', 'boost.intent_released', 'boost.activated', 'boost.split_added',
  'boost.ended', 'boost.moved', 'boost.revoked', 'boost.thanked', 'subscription.changed',
  'purchase.fulfilled', 'purchase.revoked', 'ftf.granted', 'ftf.reviewed', 'crew_year.granted',
  'crew_year.rebound', 'paywall.event'
));

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY['boost_intents', 'trip_boosts', 'boost_credits',
                                   'crew_year_grants', 'ftf_grants', 'code_redemptions'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON boost_intents, trip_boosts, boost_credits, crew_year_grants, ftf_grants,
  code_redemptions TO powersync_repl;
