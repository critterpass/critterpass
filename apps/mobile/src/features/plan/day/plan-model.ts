/**
 * The plan as the day view and the timeline read it: synced `plan_days` / `plan_items` rows folded
 * into the domain `PlanState` (the same shape the server, the rebase and the overlay replay), plus
 * each item's display fields and its place on the day in local minutes. Times are minutes after
 * the day's local midnight in the item's zone, so an overnight pickup at 03:30 the next morning is
 * 1650 and the axis extends to it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and ISO date parts, never copy. */
import {
  localSchedule,
  toLocalWallTime,
  type PlanState,
  type PlanStateDay,
  type PlanStateItem,
} from '@cp/domain';

export interface PlanDayRow {
  readonly day_no: number;
  readonly date: string | null;
  readonly theme: string | null;
}

export interface PlanItemRow {
  readonly stable_id: string;
  readonly day_no: number;
  readonly starts_at: string | null;
  readonly ends_at: string | null;
  readonly tz: string | null;
  readonly lane: string | null;
  readonly attendee_ids: string | null;
  readonly poi_id: string | null;
  readonly booking_id: string | null;
  readonly must_do_id: string | null;
  readonly category: string | null;
  readonly cost_model: string | null;
  readonly amount_minor: number | null;
  readonly currency: string | null;
  readonly status: string | null;
  readonly is_outdoor: number | null;
  readonly created_by_kind: string | null;
  readonly notes: string | null;
  readonly locked_reason: string | null;
  readonly poi_name: string | null;
  readonly poi_lat: number | null;
  readonly poi_lng: number | null;
}

export type LockKind = 'booking' | 'must_do' | 'user';

/** One item on one day, ready to draw. */
export interface DayItem {
  readonly stableId: string;
  readonly dayNo: number;
  readonly title: string;
  readonly category: string | null;
  /** Local minutes after the day's midnight; null when the item has no time yet. */
  readonly start: number | null;
  readonly end: number | null;
  readonly tz: string;
  readonly lane: string | null;
  readonly attendeeIds: readonly string[];
  readonly lock: LockKind | null;
  readonly status: string;
  readonly byGuide: boolean;
  readonly notes: string | null;
  readonly poiId: string | null;
  readonly place: { readonly lat: number; readonly lng: number } | null;
  readonly amountMinor: number | null;
  readonly currency: string | null;
  readonly costModel: string | null;
  readonly bookingId: string | null;
}

const MINUTES_PER_DAY = 24 * 60;

/** `attendee_ids` arrives as JSON text (`["a","b"]`) or a Postgres array literal (`{a,b}`). */
export function parseIds(raw: string | null): string[] {
  if (raw === null || raw === '') return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }
  return raw
    .replace(/^\{|\}$/g, '')
    .split(',')
    .map((id) => id.replace(/"/g, '').trim())
    .filter((id) => id.length > 0);
}

function lockOf(row: {
  readonly booking_id?: string | null | undefined;
  readonly locked_reason?: string | null | undefined;
}): LockKind | null {
  if (row.booking_id !== undefined && row.booking_id !== null) return 'booking';
  const reason = row.locked_reason;
  return reason === 'booking' || reason === 'must_do' || reason === 'user' ? reason : null;
}

function optional<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

export function toStateItem(row: PlanItemRow): PlanStateItem {
  const lock = lockOf(row);
  const entries = {
    starts_at: optional(row.starts_at),
    ends_at: optional(row.ends_at),
    tz: optional(row.tz),
    attendee_ids: parseIds(row.attendee_ids),
    category: optional(row.category),
    cost_model: optional(row.cost_model) as PlanStateItem['cost_model'],
    amount_minor: optional(row.amount_minor),
    currency: optional(row.currency),
    is_outdoor: row.is_outdoor === null ? undefined : row.is_outdoor === 1,
  };
  return {
    ...(Object.fromEntries(
      Object.entries(entries).filter(([, value]) => value !== undefined),
    ) as Partial<PlanStateItem>),
    stable_id: row.stable_id,
    day_no: row.day_no,
    lane: row.lane,
    poi_id: row.poi_id,
    booking_id: row.booking_id,
    must_do_id: row.must_do_id,
    notes: row.notes,
    ...(row.status === null ? {} : { status: row.status as NonNullable<PlanStateItem['status']> }),
    ...(lock === null ? {} : { locked_reason: lock }),
    created_by_kind: row.created_by_kind === 'guide' ? 'guide' : 'user',
  };
}

export function toPlanState(days: readonly PlanDayRow[], items: readonly PlanItemRow[]): PlanState {
  const planDays: PlanStateDay[] = days.map((day) => ({
    day_no: day.day_no,
    date: day.date,
    theme: day.theme,
  }));
  return { days: planDays, items: items.map(toStateItem) };
}

/** Whole days from `from` to `to` (`YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Minutes after `dayDate`'s local midnight in `tz` for the instant `at`. */
export function minutesOnDay(at: string, tz: string, dayDate: string): number {
  const wall = toLocalWallTime(new Date(at), tz);
  const [hour = 0, minute = 0] = wall.time.split(':').map(Number);
  return daysBetween(dayDate, wall.date) * MINUTES_PER_DAY + hour * 60 + minute;
}

/** The instant (ISO, UTC) of `minutes` after `dayDate`'s local midnight in `tz`. */
export function instantOnDay(dayDate: string, minutes: number, tz: string): string {
  const dayOffset = Math.floor(minutes / MINUTES_PER_DAY);
  const inDay = minutes - dayOffset * MINUTES_PER_DAY;
  const time = `${String(Math.floor(inDay / 60)).padStart(2, '0')}:${String(inDay % 60).padStart(2, '0')}`;
  return localSchedule({ date: addDays(dayDate, dayOffset), time, tz }).toISOString();
}

export interface ItemDisplay {
  readonly title: string | null;
  readonly place: { readonly lat: number; readonly lng: number } | null;
}

/** Display fields the plan state does not carry (a place's name and position), by stable id. */
export function displayOf(rows: readonly PlanItemRow[]): Map<string, ItemDisplay> {
  return new Map(
    rows.map((row) => [
      row.stable_id,
      {
        title: row.poi_name ?? row.notes,
        place:
          row.poi_lat === null || row.poi_lng === null
            ? null
            : { lat: row.poi_lat, lng: row.poi_lng },
      },
    ]),
  );
}

/** The items of day `dayNo`, in time order (untimed last), from a (possibly optimistic) state. */
export function dayItems(
  state: PlanState,
  dayNo: number,
  display: ReadonlyMap<string, ItemDisplay>,
  fallbackTz: string,
): DayItem[] {
  const day = state.days.find((candidate) => candidate.day_no === dayNo);
  const date = day?.date ?? null;
  return state.items
    .filter((item) => item.day_no === dayNo)
    .map((item): DayItem => {
      const tz = item.tz ?? fallbackTz;
      const shown = display.get(item.stable_id);
      const start =
        item.starts_at === undefined || date === null
          ? null
          : minutesOnDay(item.starts_at, tz, date);
      const end =
        item.ends_at === undefined || date === null ? null : minutesOnDay(item.ends_at, tz, date);
      return {
        stableId: item.stable_id,
        dayNo,
        title: shown?.title ?? item.notes ?? item.category ?? '',
        category: item.category ?? null,
        start,
        end: end ?? (start === null ? null : start + 60),
        tz,
        lane: item.lane ?? null,
        attendeeIds: item.attendee_ids ?? [],
        lock: lockOf(item),
        status: item.status ?? 'confirmed',
        byGuide: item.created_by_kind === 'guide',
        notes: item.notes ?? null,
        poiId: item.poi_id ?? null,
        place: shown?.place ?? null,
        amountMinor: item.amount_minor ?? null,
        currency: item.currency ?? null,
        costModel: item.cost_model ?? null,
        bookingId: item.booking_id ?? null,
      };
    })
    .sort(
      (a, b) =>
        (a.start ?? Number.MAX_SAFE_INTEGER) - (b.start ?? Number.MAX_SAFE_INTEGER) ||
        a.stableId.localeCompare(b.stableId),
    );
}
