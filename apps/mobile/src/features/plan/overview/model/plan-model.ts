/**
 * The plan as the review and the calendar export read it: days and labelled items from the synced
 * rows, and an instant's clock time in the item's own zone.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and keys, never copy. */
import { guideText } from '@/lib/i18n/guide-text';

import { idArray } from '../data/plan-rows';
import { clockOption } from '@/lib/i18n/formats';
import { type PlanDayRow, type PlanItemRow } from '@/data/plan/queries';
import { stopName } from '@/data/plan/stop-name';

export interface PlanDay {
  readonly dayNo: number;
  /** Local date `YYYY-MM-DD`; null while the trip's dates are open. */
  readonly date: string | null;
  readonly theme: string | null;
}

export interface PlanItem {
  readonly stableId: string;
  readonly dayNo: number;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly tz: string | null;
  /** The place, booking or note that names the item; null when it has none of them. */
  readonly label: string | null;
  readonly category: string | null;
  readonly poiId: string | null;
  readonly bookingId: string | null;
  readonly mustDoId: string | null;
  readonly lockedReason: string | null;
  readonly status: string | null;
  readonly byGuide: boolean;
  readonly attendeeIds: readonly string[];
  readonly lat: number | null;
  readonly lng: number | null;
  readonly amountMinor: number | null;
  readonly currency: string | null;
  readonly costModel: string | null;
}

/** The days as `locale` reads them: a theme the guide wrote shows in the app's language. */
export function toPlanDays(rows: readonly PlanDayRow[], locale = 'en'): PlanDay[] {
  return rows.map((row) => ({
    dayNo: row.day_no,
    date: row.date,
    theme: guideText('plan_day', row, 'theme', locale),
  }));
}

export function toPlanItems(
  rows: readonly PlanItemRow[],
  locale = 'en',
  places: ReadonlyMap<string, string> = new Map(),
): PlanItem[] {
  return rows.map((row) => ({
    stableId: row.stable_id,
    dayNo: row.day_no,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    tz: row.tz,
    // Named as everywhere the plan shows a stop (../../stop-name); never the guide's note.
    label: stopName({ ...row, notes: guideText('plan_item', row, 'notes', locale) }, places),
    category: row.category,
    poiId: row.poi_id,
    bookingId: row.booking_id,
    mustDoId: row.must_do_id,
    lockedReason: row.locked_reason,
    status: row.status,
    byGuide: row.created_by_kind === 'guide',
    attendeeIds: idArray(row.attendee_ids),
    lat: row.lat,
    lng: row.lng,
    amountMinor: row.amount_minor,
    currency: row.currency,
    costModel: row.cost_model,
  }));
}

/** `HH:mm` of an instant in the item's own zone. */
export function localTime(at: string | null, tz: string | null): string | null {
  if (at === null) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    ...clockOption(),
    minute: '2-digit',
    hourCycle: 'h23',
    ...(tz === null ? {} : { timeZone: tz }),
  }).format(date);
}
