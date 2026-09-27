-- Devices and the notification router's rows belong to one user and mean nothing without them, so
-- deleting the user (anonymous-account GC, account purge) takes them along. Push tokens already
-- follow their device. Device action keys stay RESTRICT on their device: the deleting job revokes
-- and removes keys first, so a key is never dropped silently.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'devices', 'notifications', 'notification_prefs', 'ping_ledger', 'roundups', 'inbox_items',
    'scheduled_deliveries'
  ] LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t, t || '_user_id_fkey');
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE',
      t, t || '_user_id_fkey'
    );
  END LOOP;
END
$$;
