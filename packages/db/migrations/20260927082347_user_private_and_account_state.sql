-- user_private, account_deletions, install_attributions (docs/data-model.md §3.1, §3.17).

-- user_private: RLS class X (owner-only, excluded from every derived view — data-model.md §1.1).
-- Holds the AES-256-GCM-encrypted phone/email (packages/db/src/crypto) and the peppered lookup hash
-- Better Auth's own `auth.user.phoneNumber` unique constraint cannot provide once a value is
-- encrypted; `phone_hash` is what a conflicting verify translates into MERGE_REQUIRED against.
CREATE TABLE user_private (
  user_id uuid PRIMARY KEY REFERENCES users (id),
  phone_e164_enc text,
  phone_hash text,
  email_enc text,
  passport_no_enc text,
  sign_in_country text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_private_phone_hash_key ON user_private (phone_hash) WHERE phone_hash IS NOT NULL;
CREATE TRIGGER user_private_touch_updated_at BEFORE UPDATE ON user_private
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
ALTER TABLE user_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_private FORCE ROW LEVEL SECURITY;
CREATE POLICY user_private_self ON user_private FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY user_private_system ON user_private FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON user_private TO app_user, app_system;
-- Merge (packages/db/src/merge-rules.ts, T10) discards the anon uid's user_private row outright
-- (existing wins, same as user_settings); app_system needs DELETE for exactly that.
GRANT DELETE ON user_private TO app_system;
-- No grant to guide_reader at all (never enters `llm` views); not entered into the powersync
-- publication allow-list (C3, excluded by packages/domain/src/privacy.ts's isPublishableClass).

-- account_deletions: RLS class O, self-service open/read; the restore/purge workflow itself is a
-- later phase's job — this phase only owns the table and the `rejectClosedAccount` guard reading it.
CREATE TABLE account_deletions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users (id),
  reason text,
  balances_snapshot jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  purge_at timestamptz NOT NULL,
  restored_at timestamptz,
  purged_at timestamptz,
  source text NOT NULL
);
ALTER TABLE account_deletions ADD CONSTRAINT account_deletions_source_check CHECK (source IN ('app', 'web'));
-- "uk user_id WHERE open": at most one deletion request in flight per user at a time.
CREATE UNIQUE INDEX account_deletions_open_user_id_key ON account_deletions (user_id)
  WHERE restored_at IS NULL AND purged_at IS NULL;
ALTER TABLE account_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_deletions FORCE ROW LEVEL SECURITY;
CREATE POLICY account_deletions_self ON account_deletions FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY account_deletions_system ON account_deletions FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON account_deletions TO app_user, app_system;
-- Merge drops any deletion-request row an anon uid somehow has; app_system needs DELETE for exactly
-- that.
GRANT DELETE ON account_deletions TO app_system;

-- Extends the powersync publication allow-list (packages/db/src/publication.ts's
-- computePublicationAllowList is the source of truth; packages/db/test/publication.test.ts
-- cross-checks the two never drift) with this migration's one genuinely publishable table: a user
-- can see their own open deletion request the same way they see their own trips. Same guarded,
-- idempotent ADD TABLE pattern as the migration that first created the publication
-- (docs/code-standards.md §13 forward-only rule: extend here, never re-open that one).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'account_deletions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION powersync ADD TABLE account_deletions';
  END IF;
  GRANT SELECT ON account_deletions TO powersync_repl;
END
$$;

-- install_attributions: RLS class S (system-only skeleton; the attribution pipeline itself is a
-- later phase's job — this table exists now so device_action_keys/merge and onboarding can already
-- reference a stable device_id → attribution mapping).
CREATE TABLE install_attributions (
  device_id uuid PRIMARY KEY,
  channel text,
  source text,
  invite_id uuid,
  join_code text,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE install_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE install_attributions FORCE ROW LEVEL SECURITY;
CREATE POLICY install_attributions_system ON install_attributions FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE ON install_attributions TO app_system;
