-- The supplier layer (docs/data-model.md §3.7): in-app activity orders placed with a supplier that
-- is the merchant of record (Viator), their line items, and the affiliate clicks and conversions of
-- link partners. Supplier content (titles, descriptions, photos, reviews) is never stored: only
-- ids, the price at the time of display, status and the supplier's references.
--
-- Every write goes through a command handler or job running as app_system; app_user reads orders
-- of trips it belongs to and never sees a supplier reference, a payment session or a click.

-- ---------------------------------------------------------------------------------------------
-- supplier_orders: RLS class T (read), C1. One cart with the supplier; the status follows
-- packages/domain/src/suppliers/order-state.ts, backstopped by the transition trigger below.
CREATE TABLE supplier_orders (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  buyer_id uuid NOT NULL REFERENCES users (id),
  supplier text NOT NULL CHECK (supplier IN ('viator', 'agoda', 'klook', 'trip_com', 'gyg')),
  -- The plan item this order books, so a vote on that item closes before the hold lapses.
  stable_id uuid,
  -- Our cart reference, sent to the supplier (unique per order, reused on retry).
  partner_cart_ref text NOT NULL UNIQUE CHECK (partner_cart_ref ~ '^[A-Za-z0-9_-]{8,64}$'),
  cart_ref text CHECK (char_length(cart_ref) <= 128),
  status text NOT NULL DEFAULT 'cart_draft' CHECK (status IN (
    'cart_draft', 'holding', 'hold_not_provided', 'awaiting_payment', 'payment_failed', 'booking',
    'pending_operator', 'confirmed', 'rejected', 'cancel_requested', 'cancelled', 'hold_expired',
    'released'
  )),
  pricing_status text CHECK (pricing_status IN ('HOLDING', 'HOLD_NOT_PROVIDED')),
  availability_status text CHECK (availability_status IN ('HOLDING', 'HOLD_NOT_PROVIDED')),
  hold_valid_until timestamptz,
  total_minor bigint CHECK (total_minor >= 0),
  currency char(3) CHECK (currency ~ '^[A-Z]{3}$'),
  -- Opens the supplier's own hosted payment form; card data never passes through us.
  payment_session_token text CHECK (char_length(payment_session_token) <= 2048),
  supplier_booking_ref text CHECK (char_length(supplier_booking_ref) <= 128),
  voucher_booking_id uuid REFERENCES bookings (id),
  rejection_code text CHECK (rejection_code ~ '^[A-Za-z0-9_]{1,80}$'),
  cancel_quote jsonb CHECK (cancel_quote IS NULL OR jsonb_typeof(cancel_quote) = 'object'),
  last_polled_at timestamptz,
  next_poll_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((total_minor IS NULL) = (currency IS NULL))
);
CREATE INDEX supplier_orders_trip_id_idx ON supplier_orders (trip_id);
CREATE INDEX supplier_orders_buyer_id_idx ON supplier_orders (buyer_id);
CREATE INDEX supplier_orders_status_poll_idx ON supplier_orders (status, last_polled_at);
CREATE INDEX supplier_orders_stable_id_idx ON supplier_orders (trip_id, stable_id)
  WHERE stable_id IS NOT NULL;
CREATE INDEX supplier_orders_voucher_booking_id_idx ON supplier_orders (voucher_booking_id)
  WHERE voucher_booking_id IS NOT NULL;
CREATE TRIGGER supplier_orders_touch_updated_at BEFORE UPDATE ON supplier_orders
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- The order machine (packages/domain/src/suppliers/order-state.ts SUPPLIER_ORDER_TRANSITIONS):
-- rejected, cancelled, hold_expired and released are final.
CREATE OR REPLACE FUNCTION app.supplier_orders_transition() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF (OLD.status, NEW.status) IN (
    ('cart_draft', 'holding'), ('cart_draft', 'hold_not_provided'), ('cart_draft', 'rejected'),
    ('holding', 'awaiting_payment'), ('holding', 'booking'), ('holding', 'hold_expired'),
    ('holding', 'released'),
    ('hold_not_provided', 'awaiting_payment'), ('hold_not_provided', 'booking'),
    ('hold_not_provided', 'hold_expired'), ('hold_not_provided', 'released'),
    ('awaiting_payment', 'booking'), ('awaiting_payment', 'payment_failed'),
    ('awaiting_payment', 'hold_expired'), ('awaiting_payment', 'released'),
    ('payment_failed', 'awaiting_payment'), ('payment_failed', 'booking'),
    ('payment_failed', 'hold_expired'), ('payment_failed', 'released'),
    ('booking', 'confirmed'), ('booking', 'pending_operator'), ('booking', 'rejected'),
    ('pending_operator', 'confirmed'), ('pending_operator', 'rejected'),
    ('pending_operator', 'cancelled'),
    ('confirmed', 'cancel_requested'), ('confirmed', 'cancelled'),
    ('cancel_requested', 'cancelled'), ('cancel_requested', 'confirmed')
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'supplier order cannot move from % to %', OLD.status, NEW.status
    USING ERRCODE = 'check_violation';
END;
$$;
REVOKE EXECUTE ON FUNCTION app.supplier_orders_transition() FROM PUBLIC;
CREATE TRIGGER supplier_orders_transition BEFORE UPDATE OF status ON supplier_orders
  FOR EACH ROW EXECUTE FUNCTION app.supplier_orders_transition();

-- A wallet booking made through an order points back at it.
ALTER TABLE bookings ADD CONSTRAINT bookings_supplier_order_id_fkey
  FOREIGN KEY (supplier_order_id) REFERENCES supplier_orders (id);
CREATE INDEX bookings_supplier_order_id_idx ON bookings (supplier_order_id)
  WHERE supplier_order_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- supplier_order_items: RLS class T (read), C1. trip_id is copied from the order so the policy and
-- the trip stream filter without a join.
CREATE TABLE supplier_order_items (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  order_id uuid NOT NULL REFERENCES supplier_orders (id) ON DELETE CASCADE,
  trip_id uuid NOT NULL REFERENCES trips (id),
  -- Our item reference, echoed by the supplier.
  item_ref text NOT NULL UNIQUE CHECK (item_ref ~ '^[A-Za-z0-9_-]{8,64}$'),
  product_code text NOT NULL CHECK (product_code ~ '^[A-Za-z0-9_-]{1,64}$'),
  product_option_code text CHECK (product_option_code ~ '^[A-Za-z0-9_-]{1,64}$'),
  travel_date date NOT NULL,
  start_time text CHECK (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  traveller_count integer NOT NULL CHECK (traveller_count BETWEEN 1 AND 99),
  price_minor bigint CHECK (price_minor >= 0),
  participant_ids uuid[] NOT NULL DEFAULT '{}'::uuid[] CHECK (cardinality(participant_ids) <= 32),
  supplier_booking_ref text CHECK (char_length(supplier_booking_ref) <= 128),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_order_items_order_id_idx ON supplier_order_items (order_id);
CREATE INDEX supplier_order_items_trip_id_idx ON supplier_order_items (trip_id);

ALTER TABLE supplier_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY supplier_orders_select ON supplier_orders FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY supplier_orders_system ON supplier_orders FOR ALL TO app_system
  USING (true) WITH CHECK (true);
-- Status, amount and hold deadline only: never the supplier's references or the payment session.
GRANT SELECT (id, trip_id, buyer_id, supplier, stable_id, status, pricing_status,
  availability_status, hold_valid_until, total_minor, currency, voucher_booking_id, version,
  created_at, updated_at) ON supplier_orders TO app_user;
GRANT SELECT, INSERT, UPDATE ON supplier_orders TO app_system;

ALTER TABLE supplier_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_order_items FORCE ROW LEVEL SECURITY;
CREATE POLICY supplier_order_items_select ON supplier_order_items FOR SELECT TO app_user
  USING (app.is_trip_member(trip_id));
CREATE POLICY supplier_order_items_system ON supplier_order_items FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT (id, order_id, trip_id, product_code, product_option_code, travel_date, start_time,
  traveller_count, price_minor, participant_ids, created_at) ON supplier_order_items TO app_user;
GRANT SELECT, INSERT, UPDATE ON supplier_order_items TO app_system;

-- ---------------------------------------------------------------------------------------------
-- affiliate_clicks: RLS class S, C2. Written by `record_supplier_click` as app_system; the sub id is
-- random and the only thing a partner ever sees. The built link is kept for the bridge redirect.
CREATE TABLE affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  trip_id uuid REFERENCES trips (id),
  partner text NOT NULL CHECK (partner IN ('agoda', 'trip_com', 'booking_cj', 'klook', 'gyg',
    'kiwitaxi', 'gettransfer', 'viator', 'grab', 'travelpayouts')),
  sub_id text NOT NULL UNIQUE CHECK (sub_id ~ '^[A-Za-z0-9_-]{20}$'),
  target_kind text NOT NULL CHECK (target_kind IN ('stay', 'activity', 'transfer', 'ride')),
  target_ref text NOT NULL CHECK (char_length(target_ref) BETWEEN 1 AND 200),
  url text NOT NULL CHECK (url ~ '^https://' AND char_length(url) <= 4096),
  clicked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_clicks_user_id_idx ON affiliate_clicks (user_id);
CREATE INDEX affiliate_clicks_trip_id_idx ON affiliate_clicks (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX affiliate_clicks_clicked_at_idx ON affiliate_clicks (clicked_at);
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks FORCE ROW LEVEL SECURITY;
CREATE POLICY affiliate_clicks_system ON affiliate_clicks FOR ALL TO app_system
  USING (true) WITH CHECK (true);
-- DELETE for retention (13 months) and the account merge.
GRANT SELECT, INSERT, UPDATE, DELETE ON affiliate_clicks TO app_system;

-- affiliate_conversions: RLS class S, C5 (commission records, kept 7 years). Imported daily from
-- the partners' statistics; the click may already be gone to retention.
CREATE TABLE affiliate_conversions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  partner text NOT NULL CHECK (partner IN ('agoda', 'trip_com', 'booking_cj', 'klook', 'gyg',
    'kiwitaxi', 'gettransfer', 'viator', 'grab', 'travelpayouts')),
  external_id text NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 128),
  sub_id text CHECK (char_length(sub_id) <= 128),
  click_id uuid REFERENCES affiliate_clicks (id) ON DELETE SET NULL,
  campaign_id integer,
  status text NOT NULL CHECK (status IN ('processing', 'paid', 'cancelled')),
  price_minor bigint CHECK (price_minor >= 0),
  commission_minor bigint NOT NULL CHECK (commission_minor >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  occurred_on date NOT NULL,
  reported_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner, external_id)
);
CREATE INDEX affiliate_conversions_click_id_idx ON affiliate_conversions (click_id)
  WHERE click_id IS NOT NULL;
CREATE TRIGGER affiliate_conversions_touch_updated_at BEFORE UPDATE ON affiliate_conversions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE affiliate_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_conversions FORCE ROW LEVEL SECURITY;
CREATE POLICY affiliate_conversions_system ON affiliate_conversions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON affiliate_conversions TO app_system;

-- ---------------------------------------------------------------------------------------------
-- Ops console reads (non-C3 columns, generated from the privacy map): the partner health line
-- reads orders and clicks.
GRANT SELECT (availability_status, buyer_id, cancel_quote, cart_ref, created_at, currency, hold_valid_until,
  id, last_polled_at, next_poll_at, partner_cart_ref, payment_session_token, pricing_status,
  rejection_code, stable_id, status, supplier, supplier_booking_ref, total_minor, trip_id, updated_at,
  version, voucher_booking_id) ON supplier_orders TO admin_reader;
CREATE POLICY supplier_orders_admin_reader ON supplier_orders FOR SELECT TO admin_reader USING (true);
GRANT SELECT (created_at, id, item_ref, order_id, participant_ids, price_minor, product_code,
  product_option_code, start_time, supplier_booking_ref, traveller_count, travel_date, trip_id)
  ON supplier_order_items TO admin_reader;
CREATE POLICY supplier_order_items_admin_reader ON supplier_order_items FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT (clicked_at, created_at, id, partner, sub_id, target_kind, target_ref, trip_id, url,
  user_id) ON affiliate_clicks TO admin_reader;
CREATE POLICY affiliate_clicks_admin_reader ON affiliate_clicks FOR SELECT TO admin_reader
  USING (true);

-- ---------------------------------------------------------------------------------------------
-- Viator's booking API is not approved yet: its adapter starts switched off on link copy (the
-- console turns it on after certification), and the app's copy keys follow.
UPDATE ops.partner_adapters
   SET enabled = false, copy_mode = 'link', approved_at = NULL
 WHERE partner = 'viator_booking' AND approved_at IS NOT NULL AND updated_by IS NULL;
UPDATE ops.ops_config SET value = to_jsonb(a.enabled)
  FROM ops.partner_adapters a
 WHERE a.partner = 'viator_booking' AND ops.ops_config.key = 'supplier.viator_booking.enabled';
UPDATE ops.ops_config SET value = to_jsonb(a.copy_mode)
  FROM ops.partner_adapters a
 WHERE a.partner = 'viator_booking' AND ops.ops_config.key = 'supplier.viator_booking.copy_mode';

-- ---------------------------------------------------------------------------------------------
-- The supplier events join the catalogue (packages/domain/src/suppliers/events.ts), added to
-- whatever the constraint lists now so a sibling migration's types are kept
-- (packages/db/test/events.test.ts cross-checks them against packages/domain).
DO $$
DECLARE
  current_values text[];
  merged text;
BEGIN
  SELECT array_agg(m[1] ORDER BY m[1]) INTO current_values
    FROM pg_constraint c,
         regexp_matches(pg_get_constraintdef(c.oid), '''([^'']+)''::text', 'g') AS m
   WHERE c.conname = 'domain_events_type_check' AND c.conrelid = 'domain_events'::regclass;
  SELECT string_agg(DISTINCT quote_literal(t), ', ') INTO merged
    FROM unnest(current_values || ARRAY[
      'supplier.link_opened', 'activity.held', 'activity.hold_released', 'activity.hold_expired',
      'hold.expiring', 'activity.booked', 'activity.pending', 'activity.rejected',
      'activity.cancelled'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList: orders and their items ride the trip
-- stream with explicit columns. Clicks and conversions are never published.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY['supplier_orders', 'supplier_order_items'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON supplier_orders, supplier_order_items TO powersync_repl;
