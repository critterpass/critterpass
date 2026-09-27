-- device_action_keys.device_id now points at the install it was issued to (docs/data-model.md
-- §3.11). Expand-only: no key could be issued before devices existed, so there are no orphans to
-- validate against. RESTRICT: a device with keys is never hard-deleted while its keys are still
-- inside their audit window.
ALTER TABLE device_action_keys
  ADD CONSTRAINT device_action_keys_device_id_fkey FOREIGN KEY (device_id) REFERENCES devices (id);
