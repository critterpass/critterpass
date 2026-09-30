-- Store billing (docs/data-model.md §3.14): each user's subscriptions as the server last verified
-- them, every store transaction bound to a Critterpass account, and the raw events RevenueCat
-- sends. RevenueCat is a messenger, the api is the entitlement authority: the webhook only stores
-- an event, and `billing.apply` refetches the customer from RevenueCat before changing anything.
--
-- `subscriptions` is the owner's to read (and syncs to them); `store_transactions` and
-- `billing_events` are system-only records (C5, kept for accounting), never granted to app_user.

-- ---------------------------------------------------------------------------------------------
-- subscriptions: RLS class O (C2). One row per store subscription (per product and account) or
-- per server-side grant of Pass+ time.
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  platform text NOT NULL CHECK (platform IN ('app_store', 'play', 'promo', 'gift')),
  rc_customer_id text CHECK (char_length(rc_customer_id) <= 200),
  original_transaction_id text CHECK (char_length(original_transaction_id) <= 200),
  product_key text NOT NULL CHECK (product_key IN (
    'pass_monthly', 'pass_yearly', 'boost_trip', 'boost_crew_year', 'gift_pass_3m'
  )),
  status text NOT NULL CHECK (status IN (
    'active', 'grace', 'billing_retry', 'on_hold', 'paused', 'cancelled_active', 'expired',
    'revoked'
  )),
  auto_renew boolean NOT NULL DEFAULT true,
  period_start timestamptz,
  period_end timestamptz,
  grace_ends_at timestamptz,
  paused_from timestamptz,
  resume_at timestamptz,
  storefront text CHECK (char_length(storefront) <= 8),
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'sandbox')),
  last_event_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Our own grants never name a store transaction.
  CHECK (platform IN ('app_store', 'play') OR original_transaction_id IS NULL),
  CHECK (grace_ends_at IS NULL OR status IN ('grace', 'billing_retry', 'on_hold', 'expired'))
);
-- One row per store product per account: a lapsed subscription bought again, or moved to another
-- plan of the same group, updates its row (store_transactions keeps every transaction).
CREATE UNIQUE INDEX subscriptions_store_uk ON subscriptions (user_id, platform, product_key)
  WHERE platform IN ('app_store', 'play');
CREATE INDEX subscriptions_original_transaction_idx ON subscriptions (platform, original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;
CREATE INDEX subscriptions_user_status_idx ON subscriptions (user_id, status);
CREATE INDEX subscriptions_product_key_idx ON subscriptions (product_key);
-- The reconcile sweep and the grace expiry read subscriptions by what is due next.
CREATE INDEX subscriptions_grace_idx ON subscriptions (grace_ends_at)
  WHERE status IN ('grace', 'billing_retry');
CREATE TRIGGER subscriptions_touch_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- store_transactions: RLS class S (C5). One row per store transaction (a purchase or a renewal),
-- unique per platform. `user_id` is nulled when the account is anonymised; the row stays for the
-- accounting record. Refunds and revocations stamp the row, they never delete it.
CREATE TABLE store_transactions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid REFERENCES users (id),
  platform text NOT NULL CHECK (platform IN ('app_store', 'play')),
  transaction_id text NOT NULL CHECK (char_length(transaction_id) BETWEEN 1 AND 200),
  original_transaction_id text CHECK (char_length(original_transaction_id) <= 200),
  subscription_id uuid REFERENCES subscriptions (id),
  product_key text NOT NULL CHECK (product_key IN (
    'pass_monthly', 'pass_yearly', 'boost_trip', 'boost_crew_year', 'gift_pass_3m'
  )),
  store_product_id text NOT NULL CHECK (char_length(store_product_id) BETWEEN 1 AND 200),
  purchased_at timestamptz NOT NULL,
  -- What the store charged, in the storefront's currency; unknown until a priced event arrives.
  price_minor bigint CHECK (price_minor >= 0),
  currency char(3) CHECK (currency ~ '^[A-Z]{3}$'),
  storefront text CHECK (char_length(storefront) <= 8),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('production', 'sandbox')),
  signed_payload text,
  offer_code text CHECK (char_length(offer_code) <= 200),
  revoked_at timestamptz,
  revocation_reason text CHECK (revocation_reason IN ('refund', 'revoke')),
  refunded_at timestamptz,
  boost_intent_id uuid,
  code_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, transaction_id),
  CHECK ((price_minor IS NULL) = (currency IS NULL)),
  CHECK ((revoked_at IS NULL) = (revocation_reason IS NULL))
);
CREATE INDEX store_transactions_user_id_idx ON store_transactions (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX store_transactions_original_idx ON store_transactions (platform, original_transaction_id);
CREATE INDEX store_transactions_subscription_id_idx ON store_transactions (subscription_id)
  WHERE subscription_id IS NOT NULL;
CREATE INDEX store_transactions_offer_code_idx ON store_transactions (offer_code)
  WHERE offer_code IS NOT NULL;
CREATE TRIGGER store_transactions_touch_updated_at BEFORE UPDATE ON store_transactions
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- billing_events: RLS class S (C5). Every provider event exactly once (source, event_id); a
-- redelivery finds its row and changes nothing. `billing.apply` stamps `processed_at`, or the last
-- `error` while it retries.
CREATE TABLE billing_events (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  source text NOT NULL CHECK (source IN ('revenuecat', 'app_store', 'play')),
  event_id text NOT NULL CHECK (char_length(event_id) BETWEEN 1 AND 200),
  type text NOT NULL CHECK (char_length(type) BETWEEN 1 AND 64),
  app_user_id text CHECK (char_length(app_user_id) <= 200),
  environment text CHECK (environment IN ('production', 'sandbox')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  event_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error text CHECK (char_length(error) <= 1000),
  UNIQUE (source, event_id)
);
CREATE INDEX billing_events_app_user_idx ON billing_events (app_user_id);
CREATE INDEX billing_events_unprocessed_idx ON billing_events (received_at)
  WHERE processed_at IS NULL;

-- ---------------------------------------------------------------------------------------------
-- Row-level security. The owner reads their subscriptions; every write is the server's.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY subscriptions_system ON subscriptions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON subscriptions TO app_user;
GRANT SELECT, INSERT, UPDATE ON subscriptions TO app_system;
-- An account merge drops the merged account's row for a product the surviving account holds.
GRANT DELETE ON subscriptions TO app_system;

ALTER TABLE store_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY store_transactions_system ON store_transactions FOR ALL TO app_system
  USING (true) WITH CHECK (true);
REVOKE ALL ON store_transactions FROM app_user, guide_reader;
GRANT SELECT, INSERT, UPDATE ON store_transactions TO app_system;

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_events_system ON billing_events FOR ALL TO app_system
  USING (true) WITH CHECK (true);
REVOKE ALL ON billing_events FROM app_user, guide_reader;
GRANT SELECT, INSERT, UPDATE ON billing_events TO app_system;

-- Ops console reads (the billing timeline, webhook health).
GRANT SELECT (auto_renew, created_at, environment, grace_ends_at, id, last_event_at,
  original_transaction_id, paused_from, period_end, period_start, platform, product_key,
  rc_customer_id, resume_at, status, storefront, updated_at, user_id) ON subscriptions TO
  admin_reader;
CREATE POLICY subscriptions_admin_reader ON subscriptions FOR SELECT TO admin_reader USING (true);
GRANT SELECT (boost_intent_id, code_id, created_at, currency, environment, id, offer_code,
  original_transaction_id, platform, price_minor, product_key, purchased_at, quantity, refunded_at,
  revocation_reason, revoked_at, signed_payload, store_product_id, storefront, subscription_id,
  transaction_id, updated_at, user_id) ON store_transactions TO admin_reader;
CREATE POLICY store_transactions_admin_reader ON store_transactions FOR SELECT TO admin_reader USING (true);
GRANT SELECT (app_user_id, attempts, environment, error, event_at, event_id, id, payload,
  processed_at, received_at, source, type) ON billing_events TO admin_reader;
CREATE POLICY billing_events_admin_reader ON billing_events FOR SELECT TO admin_reader USING (true);

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList: only the owner's subscriptions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'subscriptions'
  ) THEN
    ALTER PUBLICATION powersync ADD TABLE subscriptions;
  END IF;
END
$$;
GRANT SELECT ON subscriptions TO powersync_repl;
