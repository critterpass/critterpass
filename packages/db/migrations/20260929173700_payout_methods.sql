-- How members get paid back (docs/data-model.md §3.8): bank, PayNow, PromptPay, VietQR, DuitNow,
-- a Wise link or cash. The details (account, proxy, link) are C3: field-encrypted by the api,
-- readable by their owner, and disclosed to one other person only: the payer of an open payment to
-- the owner, through `app.reveal_payout`, which records every disclosure in `ops.reveal_audit`.

CREATE TABLE payout_methods (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind IN ('bank', 'paynow', 'promptpay', 'vietqr', 'duitnow', 'wise_link', 'cash')),
  country char(2) CHECK (country ~ '^[A-Z]{2}$'),
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 60),
  -- AES-256-GCM envelope (packages/db/src/crypto) of the method's details; cash has none.
  details_enc text CHECK (char_length(details_enc) <= 4000),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'cash') = (details_enc IS NULL))
);
-- One live method per kind per member.
CREATE UNIQUE INDEX payout_methods_user_kind_uk ON payout_methods (user_id, kind)
  WHERE deleted_at IS NULL;
CREATE TRIGGER payout_methods_touch_updated_at BEFORE UPDATE ON payout_methods
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- RLS class X (C3): owner-only, no guide_reader, no publication, no stream.
ALTER TABLE payout_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_methods FORCE ROW LEVEL SECURITY;
CREATE POLICY payout_methods_owner ON payout_methods FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY payout_methods_system ON payout_methods FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT (id, user_id, kind, country, label, details_enc),
  UPDATE (country, label, details_enc, deleted_at) ON payout_methods TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON payout_methods TO app_system;
REVOKE ALL ON payout_methods FROM guide_reader, powersync_repl;

-- ---------------------------------------------------------------------------------------------
-- ops.reveal_audit: one row per disclosure of a C3 value to someone other than its owner.
CREATE TABLE ops.reveal_audit (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  kind text NOT NULL CHECK (kind IN ('payout')),
  subject_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  viewer_id uuid NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reveal_audit_owner_idx ON ops.reveal_audit (owner_id, at DESC);
CREATE INDEX reveal_audit_viewer_idx ON ops.reveal_audit (viewer_id, at DESC);
ALTER TABLE ops.reveal_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.reveal_audit FORCE ROW LEVEL SECURITY;
CREATE POLICY reveal_audit_system ON ops.reveal_audit FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT, INSERT ON ops.reveal_audit TO app_system;
CREATE POLICY reveal_audit_admin_reader ON ops.reveal_audit FOR SELECT TO admin_reader USING (true);
GRANT SELECT ON ops.reveal_audit TO admin_reader;

-- ---------------------------------------------------------------------------------------------
-- The one disclosure path: the caller must be the payer (`from_id`) of a payment that is still
-- open (not confirmed or cancelled). Returns the payee's live methods, still encrypted (the api
-- holds the key), and audits the read. Anyone else gets no rows and no audit line.
CREATE OR REPLACE FUNCTION app.reveal_payout(p_payment uuid)
RETURNS TABLE (method_id uuid, kind text, country char(2), label text, details_enc text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  payee uuid;
BEGIN
  SELECT p.to_id INTO payee FROM payments p
   WHERE p.id = p_payment AND p.from_id = app.uid()
     AND p.status IN ('pending', 'requested', 'marked_paid', 'disputed')
     AND app.is_crew_member(p.crew_id);
  IF payee IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO ops.reveal_audit (kind, subject_id, owner_id, viewer_id)
  VALUES ('payout', p_payment, payee, app.uid());
  RETURN QUERY
    SELECT m.id, m.kind, m.country, m.label, m.details_enc FROM payout_methods m
     WHERE m.user_id = payee AND m.deleted_at IS NULL
     ORDER BY m.kind;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.reveal_payout(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reveal_payout(uuid) TO app_user;
