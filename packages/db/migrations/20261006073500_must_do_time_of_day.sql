-- When in the day a must-do should happen, decided once when it is set: `ai.fit_check` reads the
-- member's typed title with a typed decision and stores one of the seven times of day a place
-- profile uses, or NULL when the title names none (or the must-do was picked from search). The
-- draft reads the column and never the words. One additive column (privacy class unchanged: C1,
-- read by the trip's members); only the worker writes it.
ALTER TABLE must_dos ADD COLUMN IF NOT EXISTS time_of_day text;
ALTER TABLE must_dos DROP CONSTRAINT IF EXISTS must_dos_time_of_day_check;
ALTER TABLE must_dos ADD CONSTRAINT must_dos_time_of_day_check CHECK (
  time_of_day IN ('early_morning', 'morning', 'midday', 'afternoon', 'sunset', 'evening',
                  'after_dark')
);

-- The ops console reads every column of the row (the privacy map grants admin_reader the table).
GRANT SELECT (time_of_day) ON must_dos TO admin_reader;
