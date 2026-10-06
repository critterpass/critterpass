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

-- No admin_reader grant: the ops console has never been granted must_dos, and this column does not
-- change that.
