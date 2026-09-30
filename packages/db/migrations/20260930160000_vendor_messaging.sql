-- Vendor messaging (docs/data-model.md §3.16, docs/product-decisions.md D10): the WhatsApp threads
-- the ops desk keeps with restaurants, drivers and clinics on a traveller's behalf, and every
-- message in them. A message leaves only after its requester approved the exact text: the approval
-- lives in ops.approvals, the message keeps the SHA-256 of that text, and the trigger below refuses
-- to mark a message sent unless the approval, the hash and the body all still match.
--
-- RLS class S, privacy class C2 (a vendor's number is sealed; message text is what the traveller
-- wrote or the vendor replied). Only app_system writes; admin_reader reads for the desk; app_user
-- never reads `ops.*` (the traveller's cards come through the api).

-- ---------------------------------------------------------------------------------------------
-- ops.vendor_threads: one conversation with one vendor about one trip.
CREATE TABLE ops.vendor_threads (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  trip_id uuid NOT NULL REFERENCES trips (id),
  requested_by uuid NOT NULL REFERENCES users (id),
  provider_id uuid REFERENCES providers (id),
  poi_id uuid REFERENCES pois (id),
  vendor_name text NOT NULL CHECK (char_length(vendor_name) BETWEEN 1 AND 120),
  channel text NOT NULL CHECK (channel IN ('whatsapp_business', 'self_send')),
  -- The vendor's WhatsApp number: sealed with packages/db/src/crypto, and peppered-hashed so an
  -- inbound reply finds its thread without decrypting anything.
  wa_contact_enc text CHECK (char_length(wa_contact_enc) <= 4000),
  wa_contact_hash text CHECK (wa_contact_hash ~ '^[A-Za-z0-9_-]{16,128}$'),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'waiting_reply', 'replied', 'closed')),
  task_id uuid REFERENCES ops.concierge_tasks (id),
  last_inbound_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (provider_id IS NOT NULL OR poi_id IS NOT NULL),
  CHECK ((wa_contact_enc IS NULL) = (wa_contact_hash IS NULL))
);
CREATE INDEX vendor_threads_trip_idx ON ops.vendor_threads (trip_id);
CREATE INDEX vendor_threads_requested_by_idx ON ops.vendor_threads (requested_by);
CREATE INDEX vendor_threads_provider_idx ON ops.vendor_threads (provider_id)
  WHERE provider_id IS NOT NULL;
CREATE INDEX vendor_threads_poi_idx ON ops.vendor_threads (poi_id) WHERE poi_id IS NOT NULL;
CREATE INDEX vendor_threads_task_idx ON ops.vendor_threads (task_id) WHERE task_id IS NOT NULL;
CREATE INDEX vendor_threads_contact_idx ON ops.vendor_threads (wa_contact_hash, updated_at DESC)
  WHERE wa_contact_hash IS NOT NULL;
CREATE TRIGGER vendor_threads_touch_updated_at BEFORE UPDATE ON ops.vendor_threads
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- ops.vendor_messages: outbound drafts and sends, and inbound replies (verbatim, untrusted).
CREATE TABLE ops.vendor_messages (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  thread_id uuid NOT NULL REFERENCES ops.vendor_threads (id),
  trip_id uuid NOT NULL REFERENCES trips (id),
  direction text NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  proposed_by text NOT NULL DEFAULT 'user' CHECK (proposed_by IN ('user', 'guide', 'ops', 'vendor')),
  intent text CHECK (intent IN ('reserve', 'ask', 'change', 'cancel', 'other')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4096),
  status text NOT NULL CHECK (status IN (
    'draft', 'approved', 'sent', 'delivered', 'read', 'failed', 'superseded', 'received'
  )),
  approved_by_user_id uuid REFERENCES users (id),
  approved_at timestamptz,
  approval_id uuid REFERENCES ops.approvals (id),
  approved_text_sha256 char(64) CHECK (approved_text_sha256 ~ '^[0-9a-f]{64}$'),
  template_name text CHECK (template_name ~ '^[a-z0-9_]{1,200}$'),
  wa_message_id text UNIQUE CHECK (char_length(wa_message_id) <= 256),
  sent_by_admin_id uuid,
  sent_at timestamptz,
  failure_reason text CHECK (char_length(failure_reason) <= 200),
  -- The parsed reply (intent, times and prices found verbatim in the body); inbound only.
  reply jsonb CHECK (reply IS NULL OR (jsonb_typeof(reply) = 'object' AND pg_column_size(reply) <= 4096)),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((direction = 'inbound') = (status = 'received')),
  CHECK (direction = 'inbound' OR reply IS NULL)
);
CREATE INDEX vendor_messages_thread_idx ON ops.vendor_messages (thread_id, created_at);
CREATE INDEX vendor_messages_trip_idx ON ops.vendor_messages (trip_id);
CREATE INDEX vendor_messages_approved_by_idx ON ops.vendor_messages (approved_by_user_id)
  WHERE approved_by_user_id IS NOT NULL;
CREATE INDEX vendor_messages_approval_idx ON ops.vendor_messages (approval_id)
  WHERE approval_id IS NOT NULL;
CREATE INDEX vendor_messages_queue_idx ON ops.vendor_messages (status, approved_at)
  WHERE direction = 'outbound' AND status = 'approved';
CREATE TRIGGER vendor_messages_touch_updated_at BEFORE UPDATE ON ops.vendor_messages
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- The send guard. An approved text is frozen; an outbound message is approved or out only with the
-- requester's approval of this very message whose text, and hash, equal its body.
CREATE FUNCTION ops.vendor_message_guard() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.approval_id IS NOT NULL AND NEW.body IS DISTINCT FROM OLD.body THEN
    RAISE EXCEPTION 'an approved vendor message cannot be edited' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.direction = 'outbound' AND NEW.status IN ('approved', 'sent', 'delivered', 'read') THEN
    IF NEW.approved_by_user_id IS NULL OR NEW.approval_id IS NULL
       OR NEW.approved_text_sha256 IS DISTINCT FROM encode(sha256(convert_to(NEW.body, 'UTF8')), 'hex')
       OR NOT EXISTS (
         SELECT 1 FROM ops.approvals a
          WHERE a.id = NEW.approval_id
            AND a.user_id = NEW.approved_by_user_id
            AND a.subject_kind = 'vendor_message'
            AND a.subject_id = NEW.id
            AND a.text_shown = NEW.body
       ) THEN
      RAISE EXCEPTION 'vendor message % is not approved with this text', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER vendor_messages_guard BEFORE INSERT OR UPDATE ON ops.vendor_messages
  FOR EACH ROW EXECUTE FUNCTION ops.vendor_message_guard();

ALTER TABLE ops.vendor_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.vendor_threads FORCE ROW LEVEL SECURITY;
CREATE POLICY vendor_threads_system ON ops.vendor_threads FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY vendor_threads_admin_reader ON ops.vendor_threads FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT, INSERT, UPDATE ON ops.vendor_threads TO app_system;
GRANT SELECT ON ops.vendor_threads TO admin_reader;

ALTER TABLE ops.vendor_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.vendor_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY vendor_messages_system ON ops.vendor_messages FOR ALL TO app_system
  USING (true) WITH CHECK (true);
CREATE POLICY vendor_messages_admin_reader ON ops.vendor_messages FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT, INSERT, UPDATE ON ops.vendor_messages TO app_system;
GRANT SELECT ON ops.vendor_messages TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- A traveller may hand the desk anything, not only a vendor message or a clinic call.
ALTER TABLE ops.concierge_tasks DROP CONSTRAINT concierge_tasks_kind_check;
ALTER TABLE ops.concierge_tasks ADD CONSTRAINT concierge_tasks_kind_check
  CHECK (kind IN ('vendor_message', 'clinic_handoff', 'partner_booking', 'review', 'other'));

-- ---------------------------------------------------------------------------------------------
-- WhatsApp Business (the desk's sending number) waits on Meta's account and template approval: its
-- switch starts off, and until then drafts go back to the traveller to send themselves.
INSERT INTO ops.partner_adapters (partner, enabled, copy_mode, approved_at)
VALUES ('whatsapp_business', false, 'link', NULL)
ON CONFLICT (partner) DO NOTHING;
INSERT INTO ops.ops_config (key, value, is_public)
SELECT 'supplier.' || partner || '.' || field, value, true
FROM ops.partner_adapters,
  LATERAL (VALUES ('enabled', to_jsonb(enabled)), ('copy_mode', to_jsonb(copy_mode))) AS f (field, value)
WHERE partner = 'whatsapp_business'
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------------------------
-- The vendor, concierge and entry reminder events join the catalogue
-- (packages/domain/src/vendor-comms/events.ts), added to whatever the constraint lists now.
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
      'vendor_msg.drafted', 'vendor_msg.approved', 'vendor_msg.sent', 'vendor_msg.failed',
      'vendor_msg.replied', 'vendor_msg.reply_parsed', 'concierge.requested',
      'lottery.reminders_set'
    ]) AS t;
  ALTER TABLE domain_events DROP CONSTRAINT domain_events_type_check;
  EXECUTE format(
    'ALTER TABLE domain_events ADD CONSTRAINT domain_events_type_check CHECK (type IN (%s))',
    merged
  );
END
$$;
