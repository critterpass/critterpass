-- The purge reminder goes by e-mail: a closed account is signed out everywhere, so nothing inside
-- the app reaches its owner.
--
-- 1. The address. E-mail addresses live in the sign-in tables, which only the `auth` role reads.
--    This function answers the address and language of one closed account that is still waiting
--    for its purge, and nothing for any other account. A placeholder address (an account that
--    signed in by phone only, or never signed in) is no address.
CREATE OR REPLACE FUNCTION app.account_purge_reminder_contact(p_deletion_id uuid)
RETURNS TABLE (email text, locale text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT (SELECT a.email FROM auth."user" a
           WHERE a.id = d.user_id AND a.email NOT LIKE '%.invalid') AS email,
         coalesce(s.app_locale, u.locale) AS locale
    FROM account_deletions d
    JOIN users u ON u.id = d.user_id
    LEFT JOIN user_settings s ON s.user_id = d.user_id
   WHERE d.id = p_deletion_id AND d.restored_at IS NULL AND d.purged_at IS NULL;
$$;
REVOKE EXECUTE ON FUNCTION app.account_purge_reminder_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.account_purge_reminder_contact(uuid) TO app_system;

-- 2. One reminder per deletion. The row is written before the e-mail is handed to the provider
--    and removed if the provider refuses, so a retried or repeated run never sends a second one.
--    RLS class S: no app_user access at all.
CREATE TABLE account_purge_reminders (
  deletion_id uuid PRIMARY KEY REFERENCES account_deletions (id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email')),
  sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE account_purge_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_purge_reminders FORCE ROW LEVEL SECURITY;
CREATE POLICY account_purge_reminders_system ON account_purge_reminders
  FOR ALL TO app_system USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, DELETE ON account_purge_reminders TO app_system;
