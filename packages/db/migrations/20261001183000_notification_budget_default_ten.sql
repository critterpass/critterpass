-- The daily budget of BUDGET pushes starts at 10 instead of 5. Nobody has been able to choose
-- their own number yet (the preference command does not exist), so every stored 5 is the old
-- default rather than a choice and moves with it. The 1–10 range is unchanged.
ALTER TABLE notification_prefs ALTER COLUMN budget_per_day SET DEFAULT 10;
UPDATE notification_prefs SET budget_per_day = 10 WHERE budget_per_day = 5;
