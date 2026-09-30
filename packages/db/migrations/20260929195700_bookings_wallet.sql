-- The trip wallet (docs/data-model.md §3.7): typed bookings and their documents. A booking is its
-- owner's; `visibility = 'crew'` shares it with every member of the trip's crew. The barcode is an
-- AES-256-GCM envelope (packages/db/src/crypto) that app_user cannot even select: the owner gets it
-- decrypted through the api's private read, into the device's local-only store.
--
-- Every write goes through a command handler, which checks the policy as the caller and writes as
-- app_system; app_user reads.

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  owner_id uuid NOT NULL REFERENCES users (id),
  type text NOT NULL
    CHECK (type IN ('flight', 'stay', 'activity', 'boat', 'transfer', 'rail', 'car', 'other')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  starts_at timestamptz,
  ends_at timestamptz,
  tz text CHECK (tz IS NULL OR app.valid_tz(tz)),
  location text CHECK (char_length(location) <= 300),
  traveller_ids uuid[] NOT NULL DEFAULT '{}'::uuid[] CHECK (cardinality(traveller_ids) <= 32),
  price_minor bigint CHECK (price_minor >= 0),
  currency char(3) CHECK (currency ~ '^[A-Z]{3}$'),
  paid_by uuid REFERENCES users (id),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('forward', 'mailbox', 'scan', 'paste', 'viator', 'manual')),
  supplier text NOT NULL DEFAULT 'other'
    CHECK (supplier IN ('agoda', 'trip_com', 'booking', 'viator', 'klook', 'gyg', 'airline', 'other')),
  -- The confirmation code, as printed on the user's own confirmation.
  supplier_ref text CHECK (char_length(supplier_ref) <= 64),
  free_cancel_until timestamptz,
  -- Verbatim from the user's own confirmation, shown next to the parsed deadline.
  cancel_policy_text text CHECK (char_length(cancel_policy_text) <= 2000),
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled', 'pending_operator')),
  visibility text NOT NULL CHECK (visibility IN ('crew', 'personal')),
  -- A personal flight still shows its number and times to the crew unless its owner opts out.
  flight_crew_visible boolean NOT NULL DEFAULT true,
  -- Per-kind fields (room, meeting point, seat, baggage, ...), validated in packages/domain.
  details jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(details) = 'object' AND pg_column_size(details) <= 8192),
  barcode_payload_enc text CHECK (char_length(barcode_payload_enc) <= 8000),
  barcode_format text CHECK (barcode_format IN ('pdf417', 'aztec', 'qr', 'code128')),
  supplier_order_id uuid,
  deleted_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at),
  CHECK ((price_minor IS NULL) = (currency IS NULL)),
  CHECK ((barcode_payload_enc IS NULL) = (barcode_format IS NULL))
);
CREATE INDEX bookings_trip_starts_idx ON bookings (trip_id, starts_at);
CREATE INDEX bookings_owner_id_idx ON bookings (owner_id);
CREATE INDEX bookings_paid_by_idx ON bookings (paid_by) WHERE paid_by IS NOT NULL;
-- The deadline reminder and the wallet read soon-to-lapse free cancellations.
CREATE INDEX bookings_free_cancel_idx ON bookings (free_cancel_until)
  WHERE free_cancel_until IS NOT NULL AND deleted_at IS NULL;
CREATE TRIGGER bookings_touch_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
CREATE TRIGGER bookings_canonical_tz BEFORE INSERT OR UPDATE OF tz ON bookings
  FOR EACH ROW EXECUTE FUNCTION app.canonicalize_tz();

-- Expenses already name the booking they paid for (the auto-expense of a split booking).
ALTER TABLE expenses ADD CONSTRAINT expenses_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES bookings (id);
CREATE INDEX expenses_booking_id_idx ON expenses (booking_id) WHERE booking_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- booking_attachments: the confirmation PDF, a voucher or a boarding pass image (media keys of the
-- `booking_doc` purpose). The owner and crew visibility are copied from the booking so the policy
-- and the stream never join; the booking's handler keeps them in step.
CREATE TABLE booking_attachments (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  booking_id uuid NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  owner_id uuid NOT NULL REFERENCES users (id),
  crew_visible boolean NOT NULL,
  media_key text NOT NULL CHECK (char_length(media_key) <= 300),
  kind text NOT NULL CHECK (kind IN ('pdf', 'voucher', 'image', 'boarding_pass')),
  sha256 text CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, media_key)
);
CREATE INDEX booking_attachments_trip_id_idx ON booking_attachments (trip_id);
CREATE INDEX booking_attachments_owner_id_idx ON booking_attachments (owner_id);

-- ---------------------------------------------------------------------------------------------
-- Row-level security. Crew bookings are read by the trip's crew (RLS T), personal ones by their
-- owner only; soft-deleted bookings are nobody's. app_user never selects the barcode column.
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;
CREATE POLICY bookings_select ON bookings FOR SELECT TO app_user
  USING (deleted_at IS NULL
         AND (owner_id = app.uid() OR (visibility = 'crew' AND app.is_trip_member(trip_id))));
CREATE POLICY bookings_system ON bookings FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT (id, trip_id, owner_id, type, title, starts_at, ends_at, tz, location, traveller_ids,
  price_minor, currency, paid_by, source, supplier, supplier_ref, free_cancel_until,
  cancel_policy_text, status, visibility, flight_crew_visible, details, barcode_format,
  supplier_order_id, deleted_at, version, created_at, updated_at) ON bookings TO app_user;
GRANT SELECT, INSERT, UPDATE ON bookings TO app_system;

ALTER TABLE booking_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_attachments FORCE ROW LEVEL SECURITY;
CREATE POLICY booking_attachments_select ON booking_attachments FOR SELECT TO app_user
  USING (owner_id = app.uid() OR (crew_visible AND app.is_trip_member(trip_id)));
CREATE POLICY booking_attachments_system ON booking_attachments FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON booking_attachments TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON booking_attachments TO app_system;

-- Ops console reads (non-C3 columns, generated from the privacy map).
GRANT SELECT (barcode_format, barcode_payload_enc, cancel_policy_text, created_at, currency, deleted_at,
  details, ends_at, flight_crew_visible, free_cancel_until, id, location, owner_id, paid_by, price_minor,
  source, starts_at, status, supplier, supplier_order_id, supplier_ref, title, traveller_ids, trip_id,
  type, tz, updated_at, version, visibility) ON bookings TO admin_reader;
CREATE POLICY bookings_admin_reader ON bookings FOR SELECT TO admin_reader USING (true);
GRANT SELECT (booking_id, created_at, crew_visible, id, kind, media_key, owner_id, sha256, trip_id)
  ON booking_attachments TO admin_reader;
CREATE POLICY booking_attachments_admin_reader ON booking_attachments FOR SELECT TO admin_reader
  USING (true);

-- ---------------------------------------------------------------------------------------------
-- llm.bookings: what the guide may know of a trip's wallet (docs/data-model-sync-and-privacy.md
-- §2): crew bookings only, their kind, title, place, times, status and the free-cancellation
-- deadline with its policy text. Never a barcode, a document, a price or anyone's personal booking.
CREATE OR REPLACE VIEW llm.bookings AS
SELECT b.id, b.trip_id, b.type, b.title, b.location, b.starts_at, b.ends_at, b.tz, b.status,
       b.free_cancel_until, b.cancel_policy_text
FROM bookings b
WHERE b.visibility = 'crew'
  AND b.deleted_at IS NULL
  AND app.is_trip_member(b.trip_id);
GRANT SELECT ON llm.bookings TO guide_reader;

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList. The stream selects its columns
-- explicitly, so the barcode envelope never reaches a device through sync.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY['bookings', 'booking_attachments'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON bookings, booking_attachments TO powersync_repl;

-- ---------------------------------------------------------------------------------------------
-- domain_events: the bookings, import, flight and policy-vault events join the catalogue
-- (packages/domain/src/bookings/events.ts).
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
  'flight.landed', 'insurance.saved', 'insurance.deleted', 'insurance.shared'
));
