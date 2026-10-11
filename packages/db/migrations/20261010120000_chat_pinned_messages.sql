-- Pinning a message to the trip ("Boat leaves at 8 sharp, gate 3"): any active member pins or
-- unpins a crew chat message, and the pin syncs with the message so every phone shows it, offline
-- too. Members never write these columns directly; `pin_message` sets them as app_system.
ALTER TABLE messages ADD COLUMN pinned_at timestamptz;
ALTER TABLE messages ADD COLUMN pinned_by uuid REFERENCES users (id) ON DELETE SET NULL;
ALTER TABLE messages ADD CONSTRAINT messages_pin_pair CHECK (pinned_at IS NOT NULL OR pinned_by IS NULL);
CREATE INDEX messages_pinned_idx ON messages (crew_id, pinned_at DESC) WHERE pinned_at IS NOT NULL;
GRANT SELECT (pinned_at, pinned_by) ON messages TO admin_reader;
