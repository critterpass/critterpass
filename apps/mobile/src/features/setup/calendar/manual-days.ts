/**
 * Marking days by hand (the fallback without calendar access): a Monday-first month grid over the
 * setup horizon, a tap cycling a day free → busy → maybe → unmarked, and the `set_availability`
 * payload a save sends (marked days as `manual`, days taken back as `clear`). The member's own
 * marks are kept on this device in the encrypted `local_private` table so the grid reopens as left.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, storage ids and wire values, never copy. */
import type { SetAvailabilityPayload } from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

export type ManualMark = 'free' | 'busy' | 'maybe';
export type ManualMarks = Readonly<Record<string, ManualMark>>;

const CYCLE: readonly (ManualMark | null)[] = ['free', 'busy', 'maybe', null];

export function nextMark(current: ManualMark | undefined): ManualMark | null {
  const index = CYCLE.indexOf(current ?? null);
  return CYCLE[(index + 1) % CYCLE.length] ?? null;
}

export function toggled(marks: ManualMarks, date: string): ManualMarks {
  const next = nextMark(marks[date]);
  const copy: Record<string, ManualMark> = { ...marks };
  if (next === null) delete copy[date];
  else copy[date] = next;
  return copy;
}

export interface MonthGrid {
  readonly year: number;
  readonly month: number;
  /** Empty cells before day 1 in a Monday-first week. */
  readonly leadingBlanks: number;
  readonly days: readonly string[];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** The month `offset` months after `from`'s month. */
export function monthGrid(from: string, offset: number): MonthGrid {
  const [y, m] = from.split('-').map(Number);
  const first = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + offset, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    year,
    month,
    leadingBlanks: (first.getUTCDay() + 6) % 7,
    days: Array.from({ length }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`),
  };
}

/** How many month pages the horizon spans from `from` to `to`. */
export function monthCount(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return ((ty ?? 0) - (fy ?? 0)) * 12 + ((tm ?? 0) - (fm ?? 0)) + 1;
}

export function manualPayload(
  tripId: string,
  marks: ManualMarks,
  saved: ManualMarks,
): SetAvailabilityPayload {
  const clear = Object.keys(saved).filter((date) => marks[date] === undefined);
  return {
    trip_id: tripId,
    days: Object.entries(marks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, state]) => ({ date, state, source: 'manual' as const })),
    ...(clear.length > 0 ? { clear: clear.sort() } : {}),
  };
}

const MARKS_ID = 'manual_days';

export async function loadMarks(db: AbstractPowerSyncDatabase): Promise<ManualMarks> {
  const row = await db.getOptional<{ data: string | null }>(
    'SELECT data FROM local_private WHERE id = ?',
    [MARKS_ID],
  );
  try {
    const parsed: unknown = JSON.parse(row?.data ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as ManualMarks) : {};
  } catch {
    return {};
  }
}

export async function saveMarks(
  db: AbstractPowerSyncDatabase,
  marks: ManualMarks,
  at: Date,
): Promise<void> {
  await db.execute(
    'INSERT OR REPLACE INTO local_private (id, kind, data, fetched_at) VALUES (?, ?, ?, ?)',
    [MARKS_ID, MARKS_ID, JSON.stringify(marks), at.toISOString()],
  );
}
