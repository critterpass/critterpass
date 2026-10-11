-- A stay expense split by room: `split_mode = 'by_room'` charges each guest their room's nightly
-- price for the nights (shared equally inside the room), scaled to what the stay cost, as exact
-- shares that sum to the expense. `split_stay_key` names the stay of the room plan the expense
-- pays for (null: every stay). The server recomputes every live by-room expense of a trip in the
-- same transaction as a room change (stay choice, room assignment), reversing the old ledger
-- entries and writing new ones like any edit. Balances are summed from the ledger, so someone who
-- already settled up sees the difference as a new top-up or refund line; nothing already in the
-- ledger is rewritten. The column rides the row's existing policies (crew members read it, only
-- the server writes it) and keeps the expense's privacy class (C1).
ALTER TABLE expenses DROP CONSTRAINT expenses_split_mode_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_split_mode_check
  CHECK (split_mode IN ('equal', 'weights', 'fixed', 'items', 'by_room'));
ALTER TABLE expenses ADD COLUMN split_stay_key text
  CHECK (char_length(split_stay_key) BETWEEN 1 AND 40);
ALTER TABLE expenses ADD CONSTRAINT expenses_split_stay_key_by_room
  CHECK (split_stay_key IS NULL OR split_mode = 'by_room');
CREATE INDEX expenses_by_room_trip_idx ON expenses (trip_id)
  WHERE split_mode = 'by_room' AND deleted_at IS NULL;
GRANT SELECT (split_stay_key) ON expenses TO admin_reader;
