-- An install changes hands when another account registers on the same phone (sign out, then a new
-- person; `register_device` moves `devices.user_id`). What the previous account left on it stays
-- attached to the device: its action keys (revoked at the hand-over, kept for their audit window)
-- and its mirrored OS alarms. Both reference `devices (id)` without a delete action, so erasing the
-- install's current owner failed at `DELETE FROM devices`, and the whole purge rolled back.
--
-- Action keys: the purge function also removes every key issued to an install the account owns now.
-- The foreign key keeps refusing any other hard delete of a device with keys.
CREATE OR REPLACE FUNCTION app.purge_device_action_keys(p_user_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  DELETE FROM device_action_keys
   WHERE user_id = p_user_id
      OR device_id IN (SELECT id FROM devices WHERE user_id = p_user_id);
$$;
REVOKE EXECUTE ON FUNCTION app.purge_device_action_keys(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.purge_device_action_keys(uuid) TO app_system;

-- Alarms mirror what one device's OS holds; without the device there is nothing to mirror, so they
-- go with it, as push tokens, widgets and Live Activities already do.
ALTER TABLE alarms DROP CONSTRAINT alarms_device_id_fkey;
ALTER TABLE alarms
  ADD CONSTRAINT alarms_device_id_fkey FOREIGN KEY (device_id) REFERENCES devices (id)
  ON DELETE CASCADE;
