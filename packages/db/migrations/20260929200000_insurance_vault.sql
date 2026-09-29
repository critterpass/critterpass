-- The travel-insurance vault (docs/data-model.md §3.7): a member's policies, the number and the
-- assistance line sealed as AES-256-GCM envelopes (packages/db/src/crypto). RLS X: the owner reads
-- the provider and the document key, nobody else reads anything, and no stream, view or guide sees
-- it. The owner's offline copy is decrypted by the api into the device's local-only store.
--
-- Sharing is one help session at a time and only with the owner's `insurance_to_clinic` consent:
-- `app.share_insurance` records the exact text the owner approved in `ops.approvals`, and
-- `app.shared_insurance` is the ops desk's audited read of what was approved for that session.

CREATE TABLE insurance_policies (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  trip_id uuid REFERENCES trips (id),
  provider text NOT NULL CHECK (char_length(provider) BETWEEN 1 AND 80),
  policy_no_enc text NOT NULL CHECK (char_length(policy_no_enc) <= 2000),
  assistance_phone_enc text CHECK (char_length(assistance_phone_enc) <= 2000),
  doc_media_key text CHECK (char_length(doc_media_key) <= 300),
  share_with_clinic_consent_id uuid REFERENCES consents (id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX insurance_policies_user_id_idx ON insurance_policies (user_id)
  WHERE deleted_at IS NULL;
CREATE INDEX insurance_policies_trip_id_idx ON insurance_policies (trip_id) WHERE trip_id IS NOT NULL;
CREATE INDEX insurance_policies_consent_idx ON insurance_policies (share_with_clinic_consent_id)
  WHERE share_with_clinic_consent_id IS NOT NULL;
CREATE TRIGGER insurance_policies_touch_updated_at BEFORE UPDATE ON insurance_policies
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY insurance_policies_owner ON insurance_policies FOR SELECT TO app_user
  USING (user_id = app.uid() AND deleted_at IS NULL);
CREATE POLICY insurance_policies_system ON insurance_policies FOR ALL TO app_system
  USING (true) WITH CHECK (true);
GRANT SELECT (id, user_id, trip_id, provider, doc_media_key, deleted_at, created_at, updated_at)
  ON insurance_policies TO app_user;
GRANT SELECT, INSERT, UPDATE ON insurance_policies TO app_system;
REVOKE ALL ON insurance_policies FROM guide_reader, powersync_repl;
-- Ops console reads (non-C3 columns, generated from the privacy map).
GRANT SELECT (provider) ON insurance_policies TO admin_reader;
CREATE POLICY insurance_policies_admin_reader ON insurance_policies FOR SELECT TO admin_reader
  USING (true);

-- A disclosure of a sealed value is audited whatever it is.
ALTER TABLE ops.reveal_audit DROP CONSTRAINT reveal_audit_kind_check;
ALTER TABLE ops.reveal_audit ADD CONSTRAINT reveal_audit_kind_check
  CHECK (kind IN ('payout', 'insurance'));

-- ---------------------------------------------------------------------------------------------
-- The owner shares their live policy with one help session: refused (no rows) without a standing
-- `insurance_to_clinic` consent or a policy; otherwise the approval of the exact text shown is
-- recorded, the policy remembers the consent it was shared under, and the ids come back.
CREATE OR REPLACE FUNCTION app.share_insurance(p_help_session uuid, p_text text)
RETURNS TABLE (approval_id uuid, policy_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  consent uuid;
  policy uuid;
  approval uuid;
BEGIN
  SELECT c.id INTO consent FROM consents c
   WHERE c.user_id = app.uid() AND c.purpose = 'insurance_to_clinic'
     AND c.granted_at IS NOT NULL AND c.revoked_at IS NULL;
  IF consent IS NULL THEN
    RETURN;
  END IF;
  SELECT p.id INTO policy FROM insurance_policies p
   WHERE p.user_id = app.uid() AND p.deleted_at IS NULL
   ORDER BY p.updated_at DESC LIMIT 1;
  IF policy IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO ops.approvals (user_id, subject_kind, subject_id, text_shown)
  VALUES (app.uid(), 'insurance_share', p_help_session, p_text)
  RETURNING id INTO approval;
  UPDATE insurance_policies SET share_with_clinic_consent_id = consent WHERE id = policy;
  RETURN QUERY SELECT approval, policy;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.share_insurance(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.share_insurance(uuid, text) TO app_user;

-- The ops desk's read for one help session: every policy whose owner approved sharing it there and
-- still consents, still sealed (the api holds the key), each disclosure audited against `p_viewer`.
CREATE OR REPLACE FUNCTION app.shared_insurance(p_help_session uuid, p_viewer uuid)
RETURNS TABLE (user_id uuid, policy_id uuid, provider text, policy_no_enc text,
               assistance_phone_enc text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  shared record;
BEGIN
  FOR shared IN
    SELECT DISTINCT ON (p.user_id) p.user_id, p.id, p.provider, p.policy_no_enc,
           p.assistance_phone_enc
      FROM ops.approvals a
      JOIN insurance_policies p ON p.user_id = a.user_id AND p.deleted_at IS NULL
      JOIN consents c ON c.id = p.share_with_clinic_consent_id
     WHERE a.subject_kind = 'insurance_share' AND a.subject_id = p_help_session
       AND c.granted_at IS NOT NULL AND c.revoked_at IS NULL
     ORDER BY p.user_id, p.updated_at DESC
  LOOP
    INSERT INTO ops.reveal_audit (kind, subject_id, owner_id, viewer_id)
    VALUES ('insurance', shared.id, shared.user_id, p_viewer);
    user_id := shared.user_id;
    policy_id := shared.id;
    provider := shared.provider;
    policy_no_enc := shared.policy_no_enc;
    assistance_phone_enc := shared.assistance_phone_enc;
    RETURN NEXT;
  END LOOP;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.shared_insurance(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.shared_insurance(uuid, uuid) TO app_system;
