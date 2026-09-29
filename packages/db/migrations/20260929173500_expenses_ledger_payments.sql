-- The crew money ledger (docs/data-model.md §3.8): expenses with their shares and edit history, the
-- append-only ledger every balance is summed from, payments between members, and the per-member
-- balance view.
--
-- Money is integer minor units + ISO currency; a converted amount keeps the fx snapshot it used.
-- Every write goes through a command handler, which checks the policy as the caller and then
-- writes as app_system: app_user reads and never writes these tables directly. The ledger and the
-- edit history are append-only for every role; the only rewrite is the erasure pseudonymiser,
-- which swaps a user's id for a tombstone id and changes nothing else.

-- ---------------------------------------------------------------------------------------------
-- The append-only guard. `app.pseudonymise_user` sets `app.pseudonymise` for its own transaction
-- and may then rewrite only the identity columns named in the trigger's arguments; any other
-- UPDATE, any DELETE and any TRUNCATE is refused, whoever runs it.
CREATE OR REPLACE FUNCTION app.money_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND current_setting('app.pseudonymise', true) = 'on'
     AND (to_jsonb(NEW) - TG_ARGV) = (to_jsonb(OLD) - TG_ARGV) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;
REVOKE EXECUTE ON FUNCTION app.money_append_only() FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------
-- expenses: RLS class T (C1). One row per expense in the currency it was paid in, with the amount
-- converted to the crew's settlement currency at the pinned snapshot. A delete hides the row
-- (`deleted_at`) and reverses its ledger entries; the row itself stays for the history.
CREATE TABLE expenses (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  payer_id uuid NOT NULL REFERENCES users (id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  fx_snapshot_id uuid REFERENCES fx_snapshots (id),
  crew_amount_minor bigint NOT NULL CHECK (crew_amount_minor >= 0),
  crew_currency char(3) NOT NULL CHECK (crew_currency ~ '^[A-Z]{3}$'),
  split_mode text NOT NULL CHECK (split_mode IN ('equal', 'weights', 'fixed', 'items')),
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('stays', 'food', 'transit', 'fun', 'other')),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 140),
  merchant text CHECK (char_length(merchant) <= 120),
  local_date date NOT NULL,
  trip_day smallint CHECK (trip_day >= 0),
  spent_at timestamptz NOT NULL,
  poi_id uuid REFERENCES pois (id),
  booking_id uuid,
  ride_id uuid,
  boost_id uuid,
  receipt_id uuid,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'receipt', 'booking', 'boost', 'ride')),
  created_by uuid NOT NULL REFERENCES users (id),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users (id),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A converted amount always names the snapshot it was converted at.
  CHECK (currency = crew_currency OR fx_snapshot_id IS NOT NULL),
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);
CREATE INDEX expenses_trip_date_idx ON expenses (trip_id, local_date);
CREATE INDEX expenses_crew_id_idx ON expenses (crew_id);
CREATE INDEX expenses_payer_id_idx ON expenses (payer_id);
CREATE INDEX expenses_created_by_idx ON expenses (created_by);
CREATE INDEX expenses_fx_snapshot_id_idx ON expenses (fx_snapshot_id) WHERE fx_snapshot_id IS NOT NULL;
CREATE INDEX expenses_poi_id_idx ON expenses (poi_id) WHERE poi_id IS NOT NULL;
CREATE INDEX expenses_deleted_by_idx ON expenses (deleted_by) WHERE deleted_by IS NOT NULL;
CREATE TRIGGER expenses_touch_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- expense_shares: RLS class T (C1). Who owes what of one expense: the weight or fixed amount they
-- entered, their computed share in the expense currency and in the crew currency, and why a member
-- was left out. `trip_id` is copied from the expense so the stream and policy never join.
CREATE TABLE expense_shares (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  expense_id uuid NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  user_id uuid NOT NULL REFERENCES users (id),
  weight integer NOT NULL DEFAULT 1 CHECK (weight BETWEEN 0 AND 1000),
  fixed_minor bigint CHECK (fixed_minor >= 0),
  computed_minor bigint NOT NULL CHECK (computed_minor >= 0),
  crew_computed_minor bigint NOT NULL CHECK (crew_computed_minor >= 0),
  excluded_reason text CHECK (char_length(excluded_reason) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (expense_id, user_id)
);
CREATE INDEX expense_shares_trip_id_idx ON expense_shares (trip_id);
CREATE INDEX expense_shares_user_id_idx ON expense_shares (user_id);

-- ---------------------------------------------------------------------------------------------
-- expense_edits: RLS class T (C1), append-only. One row per create, edit and delete with the
-- expense as it was before and after (amounts, payer, split, words), for the history view.
CREATE TABLE expense_edits (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  expense_id uuid NOT NULL REFERENCES expenses (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  editor_id uuid NOT NULL REFERENCES users (id),
  kind text NOT NULL CHECK (kind IN ('created', 'edited', 'deleted')),
  before jsonb,
  after jsonb,
  at timestamptz NOT NULL DEFAULT now(),
  CHECK (before IS NULL OR jsonb_typeof(before) = 'object'),
  CHECK (after IS NULL OR jsonb_typeof(after) = 'object')
);
CREATE INDEX expense_edits_expense_id_idx ON expense_edits (expense_id);
CREATE INDEX expense_edits_trip_id_idx ON expense_edits (trip_id);
CREATE INDEX expense_edits_editor_id_idx ON expense_edits (editor_id);
CREATE TRIGGER expense_edits_append_only BEFORE UPDATE OR DELETE ON expense_edits
  FOR EACH ROW EXECUTE FUNCTION app.money_append_only('editor_id');
CREATE TRIGGER expense_edits_no_truncate BEFORE TRUNCATE ON expense_edits
  FOR EACH STATEMENT EXECUTE FUNCTION app.money_append_only();

-- ---------------------------------------------------------------------------------------------
-- ledger_entries: RLS class M (C1), append-only. `debtor` owes `creditor` a positive amount in the
-- crew settlement currency. An expense writes one entry per member who owes the payer; an edit or
-- delete reverses the old entries (a `reversal` pointing at each, debtor and creditor swapped) and
-- writes new ones; a confirmed payment writes one entry the other way. A member's net balance is
-- what they are owed minus what they owe, so every crew's nets sum to zero per currency.
CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  trip_id uuid REFERENCES trips (id),
  debtor_id uuid NOT NULL REFERENCES users (id),
  creditor_id uuid NOT NULL REFERENCES users (id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  source_kind text NOT NULL
    CHECK (source_kind IN ('expense', 'payment', 'boost_iou', 'adjustment', 'reversal')),
  source_id uuid NOT NULL,
  reverses_id uuid REFERENCES ledger_entries (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (debtor_id <> creditor_id),
  CHECK ((source_kind = 'reversal') = (reverses_id IS NOT NULL))
);
CREATE INDEX ledger_entries_crew_pair_idx ON ledger_entries (crew_id, debtor_id, creditor_id);
CREATE INDEX ledger_entries_trip_id_idx ON ledger_entries (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX ledger_entries_debtor_id_idx ON ledger_entries (debtor_id);
CREATE INDEX ledger_entries_creditor_id_idx ON ledger_entries (creditor_id);
CREATE INDEX ledger_entries_source_idx ON ledger_entries (source_kind, source_id);
-- An entry is reversed at most once.
CREATE UNIQUE INDEX ledger_entries_reverses_uk ON ledger_entries (reverses_id)
  WHERE reverses_id IS NOT NULL;
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION app.money_append_only('debtor_id', 'creditor_id');
CREATE TRIGGER ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION app.money_append_only();

-- ---------------------------------------------------------------------------------------------
-- payments: RLS class M (C1). A transfer the crew settles outside the app: `pending` (planned) →
-- `requested` (payee asked) → `marked_paid` (payer says sent) → `confirmed` (payee received, or
-- auto-confirmed after seven days) | `disputed` (payee did not receive it); `cancelled` when a
-- recomputed plan re-issues a request whose amount no longer matches. Only a confirmed payment
-- writes to the ledger.
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  trip_id uuid REFERENCES trips (id),
  from_id uuid NOT NULL REFERENCES users (id),
  to_id uuid NOT NULL REFERENCES users (id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  method text CHECK (method IN (
    'bank', 'paynow', 'promptpay', 'vietqr', 'duitnow', 'wise', 'cash', 'other'
  )),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'requested', 'marked_paid', 'confirmed', 'disputed', 'cancelled'
  )),
  requested_at timestamptz,
  last_nudged_at timestamptz,
  marked_at timestamptz,
  confirmed_at timestamptz,
  auto_confirmed boolean NOT NULL DEFAULT false,
  disputed_at timestamptz,
  dispute_note text CHECK (char_length(dispute_note) <= 280),
  reissued_from_id uuid REFERENCES payments (id),
  created_by uuid NOT NULL REFERENCES users (id),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_id <> to_id),
  CHECK ((status = 'confirmed') = (confirmed_at IS NOT NULL))
);
CREATE INDEX payments_crew_status_idx ON payments (crew_id, status);
CREATE INDEX payments_trip_id_idx ON payments (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX payments_from_id_idx ON payments (from_id);
CREATE INDEX payments_to_id_idx ON payments (to_id);
CREATE INDEX payments_created_by_idx ON payments (created_by);
CREATE INDEX payments_reissued_from_id_idx ON payments (reissued_from_id)
  WHERE reissued_from_id IS NOT NULL;
-- The auto-confirm sweep reads marked-paid rows by age.
CREATE INDEX payments_marked_at_idx ON payments (marked_at) WHERE status = 'marked_paid';
CREATE TRIGGER payments_touch_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Row-level security. Crew members read the crew's money (a trip's expenses through the trip);
-- a member who left keeps reading the ledger rows and payments that name them. app_system writes.
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses FORCE ROW LEVEL SECURITY;
CREATE POLICY expenses_select ON expenses FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id) OR payer_id = app.uid());
CREATE POLICY expenses_system ON expenses FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON expenses TO app_user;
GRANT SELECT, INSERT, UPDATE ON expenses TO app_system;

ALTER TABLE expense_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_shares FORCE ROW LEVEL SECURITY;
CREATE POLICY expense_shares_select ON expense_shares FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id) OR user_id = app.uid());
CREATE POLICY expense_shares_system ON expense_shares FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON expense_shares TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON expense_shares TO app_system;

ALTER TABLE expense_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_edits FORCE ROW LEVEL SECURITY;
CREATE POLICY expense_edits_select ON expense_edits FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id) OR editor_id = app.uid());
CREATE POLICY expense_edits_system ON expense_edits FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON expense_edits TO app_user;
GRANT SELECT, INSERT ON expense_edits TO app_system;

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY ledger_entries_select ON ledger_entries FOR SELECT TO app_user
  USING (app.is_crew_member(crew_id) OR debtor_id = app.uid() OR creditor_id = app.uid());
CREATE POLICY ledger_entries_system ON ledger_entries FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON ledger_entries TO app_user;
GRANT SELECT, INSERT ON ledger_entries TO app_system;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
CREATE POLICY payments_select ON payments FOR SELECT TO app_user
  USING (app.is_crew_member(crew_id) OR from_id = app.uid() OR to_id = app.uid());
CREATE POLICY payments_system ON payments FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT ON payments TO app_user;
GRANT SELECT, INSERT, UPDATE ON payments TO app_system;

-- Ops console reads (non-C3 money rows).
GRANT SELECT (amount_minor, booking_id, boost_id, category, created_at, created_by, crew_amount_minor,
  crew_currency, crew_id, currency, deleted_at, deleted_by, description, fx_snapshot_id, id, local_date,
  merchant, payer_id, poi_id, receipt_id, ride_id, source, spent_at, split_mode, trip_day, trip_id,
  updated_at, version) ON expenses TO admin_reader;
CREATE POLICY expenses_admin_reader ON expenses FOR SELECT TO admin_reader USING (true);
GRANT SELECT (amount_minor, created_at, creditor_id, crew_id, currency, debtor_id, id, reverses_id,
  source_id, source_kind, trip_id) ON ledger_entries TO admin_reader;
CREATE POLICY ledger_entries_admin_reader ON ledger_entries FOR SELECT TO admin_reader USING (true);
GRANT SELECT (amount_minor, auto_confirmed, confirmed_at, created_at, created_by, crew_id, currency,
  dispute_note, disputed_at, from_id, id, last_nudged_at, marked_at, method, reissued_from_id,
  requested_at, status, to_id, trip_id, updated_at, version) ON payments TO admin_reader;
CREATE POLICY payments_admin_reader ON payments FOR SELECT TO admin_reader USING (true);

-- ---------------------------------------------------------------------------------------------
-- member_balances: each member's net per crew and currency, summed from the ledger under the
-- caller's own RLS (the app computes the same from synced ledger rows).
CREATE VIEW member_balances WITH (security_invoker = true) AS
SELECT crew_id, currency, user_id, sum(delta)::bigint AS net_minor
FROM (
  SELECT crew_id, currency, creditor_id AS user_id, amount_minor AS delta FROM ledger_entries
  UNION ALL
  SELECT crew_id, currency, debtor_id AS user_id, -amount_minor AS delta FROM ledger_entries
) moves
GROUP BY crew_id, currency, user_id;
GRANT SELECT ON member_balances TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- Erasure: a deleted account's money rows keep their amounts but name a fresh tombstone user
-- instead (status `purged`, no name), so every other member's balance is untouched and the crew's
-- nets still sum to zero. Account deletion calls this as the system; nobody else may.
CREATE OR REPLACE FUNCTION app.pseudonymise_user(p_uid uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  tombstone uuid := uuidv7();
BEGIN
  INSERT INTO users (id, status) VALUES (tombstone, 'purged');
  PERFORM set_config('app.pseudonymise', 'on', true);
  UPDATE ledger_entries SET debtor_id = tombstone WHERE debtor_id = p_uid;
  UPDATE ledger_entries SET creditor_id = tombstone WHERE creditor_id = p_uid;
  UPDATE expense_edits SET editor_id = tombstone WHERE editor_id = p_uid;
  UPDATE expense_shares SET user_id = tombstone WHERE user_id = p_uid;
  UPDATE expenses SET payer_id = tombstone WHERE payer_id = p_uid;
  UPDATE expenses SET created_by = tombstone WHERE created_by = p_uid;
  UPDATE expenses SET deleted_by = tombstone WHERE deleted_by = p_uid;
  UPDATE payments SET from_id = tombstone WHERE from_id = p_uid;
  UPDATE payments SET to_id = tombstone WHERE to_id = p_uid;
  UPDATE payments SET created_by = tombstone WHERE created_by = p_uid;
  PERFORM set_config('app.pseudonymise', 'off', true);
  RETURN tombstone;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.pseudonymise_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.pseudonymise_user(uuid) TO app_system;

-- ---------------------------------------------------------------------------------------------
-- "Remind everyone" runs at most once a day per trip: when it last ran, from the event log.
CREATE OR REPLACE FUNCTION app.last_payments_reminder_at(p_trip uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT max(e.occurred_at) FROM domain_events e
   WHERE e.type = 'payment.reminded' AND e.trip_id = p_trip
$$;
REVOKE EXECUTE ON FUNCTION app.last_payments_reminder_at(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.last_payments_reminder_at(uuid) TO app_system;

-- ---------------------------------------------------------------------------------------------
-- domain_events: the money events join the catalogue (packages/domain/src/money/events.ts).
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
  'expense.added', 'expense.edited', 'expense.deleted', 'crew.settlement_currency_changed',
  'budget.target_changed', 'payment.requested', 'payment.nudged', 'payment.marked_paid',
  'payment.confirmed', 'payment.disputed', 'payment.reminded', 'trip.settled', 'profile.payout_set',
  'receipt.parsed'
));

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY['expenses', 'expense_shares', 'expense_edits', 'ledger_entries',
                                   'payments'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON expenses, expense_shares, expense_edits, ledger_entries, payments TO powersync_repl;
