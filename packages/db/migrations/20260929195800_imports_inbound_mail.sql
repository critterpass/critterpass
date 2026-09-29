-- Imports (docs/data-model.md §3.7): every crew's forward address, the mail that reaches it, the
-- senders members linked with a reply code, the candidates the parser proposes, and mailbox
-- connections for the daily scan. Sender addresses and message ids are only ever stored as
-- peppered HMAC hashes; the raw mail lives in R2 for 7 days under `r2_key`, and OAuth refresh
-- tokens are AES-256-GCM envelopes nobody but the api's system role reads.

-- ---------------------------------------------------------------------------------------------
-- crew_inbound_addresses: `{local_part}@in.critterpass.app`, one active per crew. A crew gets its
-- address when it is created (the crew name as a slug, a short suffix when taken); an organiser's
-- rotation retires the old one, so mail to it bounces from then on.
CREATE TABLE crew_inbound_addresses (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  local_part text NOT NULL UNIQUE CHECK (local_part ~ '^[a-z0-9]([a-z0-9-]{0,46}[a-z0-9])?$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  rotated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'retired') = (rotated_at IS NOT NULL))
);
CREATE UNIQUE INDEX crew_inbound_addresses_active_uk ON crew_inbound_addresses (crew_id)
  WHERE status = 'active';

-- The crew name as an address slug: lower-case ASCII letters and digits joined by single dashes.
CREATE OR REPLACE FUNCTION app.inbound_slug(p_name text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(
    nullif(trim(both '-' from left(regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'), 32)), ''),
    'crew')
$$;

-- Issues the crew's active address (or a fresh one, retiring the old, when rotating) and returns
-- its local part. A slug that is taken or reserved gets a random 5-character suffix.
CREATE OR REPLACE FUNCTION app.issue_inbound_address(p_crew uuid, p_rotate boolean) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  base text;
  current_part text;
  candidate text;
  attempt integer := 0;
BEGIN
  SELECT app.inbound_slug(c.name) INTO base FROM crews c WHERE c.id = p_crew;
  IF base IS NULL THEN
    RAISE EXCEPTION 'crew % not found', p_crew USING ERRCODE = 'no_data_found';
  END IF;
  SELECT a.local_part INTO current_part FROM crew_inbound_addresses a
   WHERE a.crew_id = p_crew AND a.status = 'active' FOR UPDATE;
  IF current_part IS NOT NULL AND NOT p_rotate THEN
    RETURN current_part;
  END IF;
  UPDATE crew_inbound_addresses SET status = 'retired', rotated_at = now()
   WHERE crew_id = p_crew AND status = 'active';
  LOOP
    candidate := CASE
      WHEN attempt = 0 AND NOT p_rotate
           AND base NOT IN ('postmaster', 'abuse', 'admin', 'hostmaster', 'noreply', 'no-reply',
                            'support', 'security', 'mailer-daemon', 'bounce', 'bounces')
        THEN base
      ELSE left(base, 26) || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 5)
    END;
    BEGIN
      INSERT INTO crew_inbound_addresses (crew_id, local_part) VALUES (p_crew, candidate);
      RETURN candidate;
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
      IF attempt > 8 THEN
        RAISE;
      END IF;
    END;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.issue_inbound_address(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.issue_inbound_address(uuid, boolean) TO app_system;

CREATE OR REPLACE FUNCTION app.crews_issue_inbound_address() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM app.issue_inbound_address(NEW.id, false);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.crews_issue_inbound_address() FROM PUBLIC;
CREATE TRIGGER crews_issue_inbound_address AFTER INSERT ON crews
  FOR EACH ROW EXECUTE FUNCTION app.crews_issue_inbound_address();

-- Every crew that exists already gets its address now.
SELECT app.issue_inbound_address(c.id, false) FROM crews c
 WHERE NOT EXISTS (
   SELECT 1 FROM crew_inbound_addresses a WHERE a.crew_id = c.id AND a.status = 'active'
 );

-- ---------------------------------------------------------------------------------------------
-- inbound_sender_links: a sender address (hashed) a member proved is theirs by entering the
-- 6-digit code the auto-reply sent it. Pending rows hold the code's hash and expiry; a verified
-- row names the member, and their mail from that sender is accepted into any crew they are in.
CREATE TABLE inbound_sender_links (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  crew_id uuid NOT NULL REFERENCES crews (id),
  user_id uuid REFERENCES users (id) ON DELETE CASCADE,
  sender_hash text NOT NULL CHECK (sender_hash ~ '^[0-9a-f]{64}$'),
  code_hash text CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  code_expires_at timestamptz,
  attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (crew_id, sender_hash),
  CHECK (verified_at IS NULL OR user_id IS NOT NULL),
  CHECK ((code_hash IS NULL) = (code_expires_at IS NULL))
);
CREATE INDEX inbound_sender_links_sender_idx ON inbound_sender_links (sender_hash)
  WHERE verified_at IS NOT NULL;
CREATE INDEX inbound_sender_links_user_id_idx ON inbound_sender_links (user_id)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------------------------
-- inbound_emails: one row per message the Worker accepted at a crew address, with the sender
-- authentication verdicts it saw. `quarantined` mail waits for its sender to be linked.
CREATE TABLE inbound_emails (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  address_id uuid NOT NULL REFERENCES crew_inbound_addresses (id),
  crew_id uuid REFERENCES crews (id),
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  sender_hash text NOT NULL CHECK (sender_hash ~ '^[0-9a-f]{64}$'),
  message_id_hash text NOT NULL CHECK (message_id_hash ~ '^[0-9a-f]{64}$'),
  r2_key text CHECK (char_length(r2_key) <= 300),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 0 AND 26214400),
  dkim text NOT NULL CHECK (dkim IN ('pass', 'fail', 'none')),
  spf text NOT NULL CHECK (spf IN ('pass', 'fail', 'softfail', 'neutral', 'none')),
  status text NOT NULL CHECK (status IN ('accepted', 'quarantined', 'parsed', 'failed')),
  quarantine_reason text CHECK (quarantine_reason IN ('unknown_sender', 'auth_failed')),
  raw_purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (address_id, message_id_hash),
  CHECK ((status = 'quarantined') = (quarantine_reason IS NOT NULL))
);
CREATE INDEX inbound_emails_address_created_idx ON inbound_emails (address_id, created_at);
CREATE INDEX inbound_emails_crew_id_idx ON inbound_emails (crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX inbound_emails_user_id_idx ON inbound_emails (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX inbound_emails_quarantine_idx ON inbound_emails (crew_id, sender_hash)
  WHERE status = 'quarantined';
CREATE TRIGGER inbound_emails_touch_updated_at BEFORE UPDATE ON inbound_emails
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- import_candidates: what the parser read from a forward, a paste, a scan or a mailbox, waiting for
-- ADD or IGNORE. `dedupe_key` names its scope (the crew for forwards, the user otherwise), the
-- supplier and the confirmation code (or the normalised title and start), so the same booking
-- forwarded by three members is one candidate; later copies are `duplicate` rows that point at it.
CREATE TABLE import_candidates (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  crew_id uuid REFERENCES crews (id),
  trip_id uuid REFERENCES trips (id),
  source text NOT NULL CHECK (source IN ('forward', 'mailbox', 'scan', 'paste')),
  extracted jsonb CHECK (extracted IS NULL
                         OR (jsonb_typeof(extracted) = 'object' AND pg_column_size(extracted) <= 16384)),
  confidence real CHECK (confidence BETWEEN 0 AND 1),
  dedupe_key text NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'parsing'
    CHECK (status IN ('parsing', 'pending', 'accepted', 'rejected', 'duplicate', 'failed')),
  -- Shown to the crew: forwards to the crew address, and mailbox finds whose owner consented.
  crew_visible boolean NOT NULL DEFAULT false,
  -- The text tripped the injection screen: nothing happens without the user's own confirm.
  needs_confirm boolean NOT NULL DEFAULT false,
  failure_reason text CHECK (failure_reason IN ('unreadable', 'unsupported_attachment', 'empty',
                                                'no_booking', 'fetch_failed', 'blocked_url')),
  duplicate_of_id uuid REFERENCES import_candidates (id),
  booking_id uuid REFERENCES bookings (id),
  inbound_email_id uuid REFERENCES inbound_emails (id) ON DELETE SET NULL,
  resolved_by uuid REFERENCES users (id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT crew_visible OR crew_id IS NOT NULL),
  CHECK ((status = 'failed') = (failure_reason IS NOT NULL)),
  CHECK ((resolved_at IS NULL) = (resolved_by IS NULL))
);
CREATE UNIQUE INDEX import_candidates_dedupe_uk ON import_candidates (dedupe_key);
CREATE INDEX import_candidates_user_id_idx ON import_candidates (user_id);
CREATE INDEX import_candidates_crew_idx ON import_candidates (crew_id) WHERE crew_visible;
CREATE INDEX import_candidates_trip_id_idx ON import_candidates (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX import_candidates_booking_id_idx ON import_candidates (booking_id)
  WHERE booking_id IS NOT NULL;
CREATE INDEX import_candidates_inbound_email_id_idx ON import_candidates (inbound_email_id)
  WHERE inbound_email_id IS NOT NULL;
CREATE INDEX import_candidates_duplicate_of_id_idx ON import_candidates (duplicate_of_id)
  WHERE duplicate_of_id IS NOT NULL;
CREATE INDEX import_candidates_resolved_by_idx ON import_candidates (resolved_by)
  WHERE resolved_by IS NOT NULL;
CREATE TRIGGER import_candidates_touch_updated_at BEFORE UPDATE ON import_candidates
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Who sees a candidate: its owner; the crew when it is crew-visible, and for a mailbox find only
-- while the owner's `mailbox_surfacing` consent stands (read here, since consents are owner-only).
CREATE OR REPLACE FUNCTION app.can_see_candidate(
  p_owner uuid, p_crew uuid, p_source text, p_crew_visible boolean
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p_owner = app.uid()
      OR (p_crew_visible AND p_crew IS NOT NULL AND app.is_crew_member(p_crew)
          AND (p_source <> 'mailbox' OR EXISTS (
                SELECT 1 FROM consents c
                 WHERE c.user_id = p_owner AND c.purpose = 'mailbox_surfacing'
                   AND c.granted_at IS NOT NULL AND c.revoked_at IS NULL)))
$$;
REVOKE EXECUTE ON FUNCTION app.can_see_candidate(uuid, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_see_candidate(uuid, uuid, text, boolean) TO app_user, app_system;

-- ---------------------------------------------------------------------------------------------
-- mailbox_connections: a Pass+ member's Gmail or Microsoft read-only grant (RLS X). The refresh
-- token and the incremental cursor never leave the system role; the owner reads the status.
CREATE TABLE mailbox_connections (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('gmail', 'microsoft')),
  scopes text NOT NULL CHECK (char_length(scopes) <= 500),
  refresh_token_enc text CHECK (char_length(refresh_token_enc) <= 8000),
  last_history_id text CHECK (char_length(last_history_id) <= 4000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'revoked', 'error')),
  last_scan_at timestamptz,
  last_error text CHECK (char_length(last_error) <= 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
CREATE INDEX mailbox_connections_active_idx ON mailbox_connections (last_scan_at)
  WHERE status = 'active';
CREATE TRIGGER mailbox_connections_touch_updated_at BEFORE UPDATE ON mailbox_connections
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Row-level security.
ALTER TABLE crew_inbound_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_inbound_addresses FORCE ROW LEVEL SECURITY;
CREATE POLICY crew_inbound_addresses_select ON crew_inbound_addresses FOR SELECT TO app_user
  USING (status = 'active' AND app.is_crew_member(crew_id));
CREATE POLICY crew_inbound_addresses_system ON crew_inbound_addresses FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON crew_inbound_addresses TO app_user;
GRANT SELECT, INSERT, UPDATE ON crew_inbound_addresses TO app_system;

-- System only (RLS S): no app_user grant at all.
ALTER TABLE inbound_sender_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_sender_links FORCE ROW LEVEL SECURITY;
CREATE POLICY inbound_sender_links_system ON inbound_sender_links FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON inbound_sender_links TO app_system;

ALTER TABLE inbound_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_emails FORCE ROW LEVEL SECURITY;
CREATE POLICY inbound_emails_system ON inbound_emails FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON inbound_emails TO app_system;

ALTER TABLE import_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_candidates FORCE ROW LEVEL SECURITY;
CREATE POLICY import_candidates_select ON import_candidates FOR SELECT TO app_user
  USING (app.can_see_candidate(user_id, crew_id, source, crew_visible));
CREATE POLICY import_candidates_system ON import_candidates FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT ON import_candidates TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON import_candidates TO app_system;

-- RLS X: owner-only, never the token or the cursor, no guide_reader, no publication.
ALTER TABLE mailbox_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE mailbox_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY mailbox_connections_owner ON mailbox_connections FOR SELECT TO app_user
  USING (user_id = app.uid());
CREATE POLICY mailbox_connections_system ON mailbox_connections FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT (id, user_id, provider, scopes, status, last_scan_at, last_error, created_at, updated_at)
  ON mailbox_connections TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON mailbox_connections TO app_system;
REVOKE ALL ON inbound_sender_links, inbound_emails, mailbox_connections
  FROM guide_reader, powersync_repl;

-- Ops console reads (non-C3 columns, generated from the privacy map).
GRANT SELECT (created_at, crew_id, id, local_part, rotated_at, status) ON crew_inbound_addresses
  TO admin_reader;
CREATE POLICY crew_inbound_addresses_admin_reader ON crew_inbound_addresses FOR SELECT
  TO admin_reader USING (true);
GRANT SELECT (booking_id, confidence, created_at, crew_id, crew_visible, dedupe_key, duplicate_of_id,
  extracted, failure_reason, id, inbound_email_id, needs_confirm, resolved_at, resolved_by, source,
  status, trip_id, updated_at, user_id) ON import_candidates TO admin_reader;
CREATE POLICY import_candidates_admin_reader ON import_candidates FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT (attempts) ON inbound_sender_links TO admin_reader;
CREATE POLICY inbound_sender_links_admin_reader ON inbound_sender_links FOR SELECT TO admin_reader
  USING (true);
GRANT SELECT (dkim, quarantine_reason, size_bytes, spf, status) ON inbound_emails TO admin_reader;
CREATE POLICY inbound_emails_admin_reader ON inbound_emails FOR SELECT TO admin_reader USING (true);
GRANT SELECT (last_error, provider, scopes, status) ON mailbox_connections TO admin_reader;
CREATE POLICY mailbox_connections_admin_reader ON mailbox_connections FOR SELECT TO admin_reader
  USING (true);

-- ---------------------------------------------------------------------------------------------
-- PowerSync publication (docs/code-standards.md §13), hand-copied from
-- packages/db/src/publication.ts#computePublicationAllowList.
DO $$
DECLARE
  published text;
BEGIN
  FOREACH published IN ARRAY ARRAY['crew_inbound_addresses', 'import_candidates'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = published
    ) THEN
      EXECUTE format('ALTER PUBLICATION powersync ADD TABLE %I', published);
    END IF;
  END LOOP;
END
$$;
GRANT SELECT ON crew_inbound_addresses, import_candidates TO powersync_repl;
