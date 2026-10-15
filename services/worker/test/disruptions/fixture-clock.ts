/**
 * The clock the disruption suites plan on: midnight UTC starting the day after the suite starts.
 * Undo windows, forecasts and plan times are checked against the database's own clock, so a
 * fixture pinned to a calendar date breaks once that date passes; one a day ahead never does.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const today = new Date();

/** Midnight UTC of the fixture day. */
export const FIXTURE_NOW = new Date(
  Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1),
);

/** The instant `hhmm` UTC, `dayOffset` days after the fixture day, as an ISO string. */
export function at(hhmm: string, dayOffset = 0): string {
  const [hours = 0, minutes = 0] = hhmm.split(':').map(Number);
  return new Date(
    FIXTURE_NOW.getTime() + dayOffset * DAY_MS + (hours * 60 + minutes) * 60_000,
  ).toISOString();
}

/** The date (YYYY-MM-DD) `dayOffset` days after the fixture day. */
export function dateOf(dayOffset = 0): string {
  return at('00:00', dayOffset).slice(0, 10);
}
