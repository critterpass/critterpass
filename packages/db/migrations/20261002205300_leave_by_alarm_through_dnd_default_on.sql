-- Leave-by alarms ring through Do Not Disturb unless the person switches it off: the leave-by alarm
-- always gets through (product decision Q-85) and Settings shows the switch on. Nobody could have
-- switched it yet (the row was never offered), so every existing row takes the new default too.
ALTER TABLE user_settings ALTER COLUMN leave_by_through_dnd SET DEFAULT true;
UPDATE user_settings SET leave_by_through_dnd = true WHERE NOT leave_by_through_dnd;
