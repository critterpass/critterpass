-- device_action_keys (docs/data-model.md §3.1; docs/api-contracts-async.md §5): extension auth
-- primitive. RLS class O: the owning user may read/revoke their own rows (a future phase's
-- /v1/devices/{id}/action-keys route runs as app_user); app_system issues/rotates/revokes on behalf
-- of merge, deletion, and admin actions. `secret_enc` is AES-256-GCM encrypted at rest
-- (packages/db/src/crypto); the plaintext secret is returned to the caller once, at issuance, and
-- never stored or logged.
CREATE TABLE device_action_keys (
  key_id text PRIMARY KEY,
  device_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id),
  secret_enc text NOT NULL,
  scopes text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
ALTER TABLE device_action_keys ADD CONSTRAINT device_action_keys_scopes_nonempty_check CHECK (cardinality(scopes) > 0);
CREATE INDEX device_action_keys_user_id_idx ON device_action_keys (user_id);
CREATE INDEX device_action_keys_device_id_idx ON device_action_keys (device_id);
ALTER TABLE device_action_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_action_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY device_action_keys_self ON device_action_keys FOR ALL TO app_user
  USING (user_id = app.uid()) WITH CHECK (user_id = app.uid());
CREATE POLICY device_action_keys_system ON device_action_keys FOR ALL TO app_system USING (true) WITH CHECK (true);
-- No DELETE grant to either role (repo-wide convention): revocation sets revoked_at, it never deletes
-- the row outright, so a key's own scopes/history stay auditable.
GRANT SELECT, INSERT, UPDATE ON device_action_keys TO app_user, app_system;

-- Never published (secret material, even encrypted): excluded from the powersync allow-list by
-- omission, matching docs/data-model.md §3.1 "C3 (secret hash)".

-- Merge (packages/db/src/merge-rules.ts) revokes the anon uid's own keys rather than hard-deleting
-- them: no role has a DELETE grant on this table (retention needs the row to stay auditable for
-- 30 d), so this is a SECURITY DEFINER escape hatch, the same pattern as app.bump_fair_use.
CREATE OR REPLACE FUNCTION app.merge_revoke_device_action_keys(p_user_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  UPDATE device_action_keys SET revoked_at = now() WHERE user_id = p_user_id AND revoked_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION app.merge_revoke_device_action_keys(uuid) TO app_system;
