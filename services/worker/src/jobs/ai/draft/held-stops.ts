/**
 * Stops the organiser placed by hand before or between the guide's drafts. They are hers: a draft
 * or a one-day redraft never moves, retimes or drops one. The guide is not offered their places
 * again, a must-do she already placed is not placed twice, and once the guide's days are checked
 * her stops go back in exactly where she put them. A stop of the guide's that would overlap one
 * of hers, or repeat its place, gives way; a booked stop or a must-do of the guide's stays (the
 * plan check then shows the clash for her to settle).
 *
 * A held stop is a row of her draft with `created_by_kind = 'user'` and no booking: bookings
 * follow the wallet, not this rule.
 */
import type { DraftDay, DraftItem, Itinerary } from '@cp/domain';
import { foodRole, mealAt, minuteOfDate, type DraftPoi, type TravelMatrix } from '@cp/planner';
import type pg from 'pg';

export interface HeldStop {
  readonly dayNo: number;
  readonly item: DraftItem;
  /** Where a stop on a dropped pin is (it has no place of ours). */
  readonly pin?: { readonly name: string; readonly lat: number; readonly lng: number };
}

interface HeldRow {
  readonly day_no: number;
  readonly stable_id: string;
  readonly category: string | null;
  readonly poi_id: string | null;
  readonly starts_at: Date;
  readonly ends_at: Date;
  readonly tz: string | null;
  readonly must_do_id: string | null;
  readonly cost_model: string | null;
  readonly amount_minor: string | null;
  readonly currency: string | null;
  readonly notes: string | null;
  readonly custom_place: HeldStop['pin'] | null;
}

/** SQL for the rows of version `v` that are hers to keep (alias `i` over `plan_items`). */
export const HELD_ROW_SQL = "i.created_by_kind = 'user' AND i.booking_id IS NULL";

/**
 * The timed stops she placed on `versionId`, as the planner's items. A stop at a must-do's place
 * carries that must-do, so it counts as made. Read as the system.
 */
export async function loadHeldStops(
  tx: pg.PoolClient,
  versionId: string,
  fallback: { readonly tz: string; readonly currency: string },
): Promise<HeldStop[]> {
  const { rows } = await tx.query<HeldRow>(
    `SELECT d.day_no, i.stable_id, i.category, i.poi_id, i.starts_at, i.ends_at, i.tz,
            coalesce(i.must_do_id, (
              SELECT m.id FROM must_dos m
               WHERE m.trip_id = i.trip_id AND m.deleted_at IS NULL AND m.poi_id = i.poi_id
               ORDER BY m.created_at, m.id LIMIT 1)) AS must_do_id,
            i.cost_model, i.amount_minor, i.currency, i.notes, i.custom_place
       FROM plan_items i JOIN plan_days d ON d.id = i.day_id
      WHERE i.version_id = $1 AND ${HELD_ROW_SQL}
        AND i.starts_at IS NOT NULL AND i.ends_at IS NOT NULL
        AND i.status IS DISTINCT FROM 'cancelled'
      ORDER BY d.day_no, i.starts_at, i.stable_id`,
    [versionId],
  );
  return rows.map((row) => ({
    dayNo: row.day_no,
    ...(row.poi_id === null && row.custom_place != null ? { pin: row.custom_place } : {}),
    item: {
      stable_id: row.stable_id,
      kind: row.category === 'meal' || row.category === 'food' ? 'meal' : 'activity',
      poi_id: row.poi_id,
      starts_at: row.starts_at.toISOString(),
      ends_at: row.ends_at.toISOString(),
      tz: row.tz ?? fallback.tz,
      must_do_id: row.must_do_id,
      booking_id: null,
      locked_reason: 'user',
      cost_model: row.cost_model === 'group' ? 'group' : 'per_person',
      amount_minor: Number(row.amount_minor ?? 0),
      currency: row.currency ?? fallback.currency,
      travel_min: 0,
      note: row.notes,
    },
  }));
}

/**
 * Which of her stops are the day's lunch or dinner: one that starts at a meal time and is at a
 * place that serves meals, or that she filed as food herself. The planner then plans no other
 * meal for that time; anything else of hers is a stop the day is planned around.
 */
export function withMealKinds(
  held: readonly HeldStop[],
  pois: ReadonlyMap<string, DraftPoi>,
  frame: { readonly dates: readonly string[]; readonly tz: string },
): HeldStop[] {
  return held.map((stop) => {
    const poi = stop.item.poi_id === null ? undefined : pois.get(stop.item.poi_id);
    const date = frame.dates[stop.dayNo - 1];
    const meal =
      date === undefined
        ? null
        : mealAt(minuteOfDate(new Date(stop.item.starts_at), date, frame.tz));
    const eats = stop.item.kind === 'meal' || (poi !== undefined && foodRole(poi) === 'meal');
    const kind = eats && (meal === 'lunch' || meal === 'dinner') ? 'meal' : 'activity';
    return kind === stop.item.kind ? stop : { ...stop, item: { ...stop.item, kind } };
  });
}

export function heldPlaceIds(held: readonly HeldStop[]): Set<string> {
  return new Set(held.flatMap((stop) => (stop.item.poi_id === null ? [] : [stop.item.poi_id])));
}

export function heldMustDoIds(held: readonly HeldStop[]): Set<string> {
  return new Set(
    held.flatMap((stop) => (stop.item.must_do_id === null ? [] : [stop.item.must_do_id])),
  );
}

const overlaps = (a: DraftItem, b: DraftItem): boolean =>
  Date.parse(a.starts_at) < Date.parse(b.ends_at) &&
  Date.parse(b.starts_at) < Date.parse(a.ends_at);

/** The day's travel minutes, each from the stop before it. */
function withTravel(items: readonly DraftItem[], travel: TravelMatrix): DraftItem[] {
  return items.map((item, index) => {
    const before = items[index - 1];
    const minutes =
      before?.poi_id == null || item.poi_id === null
        ? 0
        : (travel(before.poi_id, item.poi_id) ?? 0);
    return { ...item, travel_min: Math.max(0, Math.round(minutes)) };
  });
}

export interface HeldDay {
  readonly day: DraftDay;
  /** Stops of the guide's that gave way to hers. */
  readonly gaveWay: readonly string[];
}

/** One day with her stops back exactly as she placed them. */
export function holdDay(day: DraftDay, held: readonly HeldStop[], travel: TravelMatrix): HeldDay {
  const hers = held.filter((stop) => stop.dayNo === day.day_no).map((stop) => stop.item);
  const heldIds = new Set(held.map((stop) => stop.item.stable_id));
  const places = heldPlaceIds(held);
  const mustDos = heldMustDoIds(held);
  const gaveWay: string[] = [];
  const kept = day.items.filter((item) => {
    // Her own stop as the guide returned it: replaced by the stop as she placed it.
    if (heldIds.has(item.stable_id)) return false;
    const repeats =
      (item.poi_id !== null && places.has(item.poi_id)) ||
      (item.must_do_id !== null && mustDos.has(item.must_do_id));
    const fixed = item.booking_id !== null || (item.must_do_id !== null && !repeats);
    const clashes = hers.some((mine) => overlaps(mine, item));
    if (repeats || (clashes && !fixed)) {
      gaveWay.push(item.stable_id);
      return false;
    }
    return true;
  });
  if (hers.length === 0 && gaveWay.length === 0 && kept.length === day.items.length) {
    return { day, gaveWay };
  }
  const items = [...kept, ...hers].sort(
    (a, b) =>
      Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.stable_id.localeCompare(b.stable_id),
  );
  return { day: { ...day, items: withTravel(items, travel) }, gaveWay };
}

/** Every day with her stops back in. With none held the itinerary is returned as it came. */
export function holdStops(
  itinerary: Itinerary,
  held: readonly HeldStop[],
  travel: TravelMatrix,
): { readonly itinerary: Itinerary; readonly gaveWay: readonly string[] } {
  if (held.length === 0) return { itinerary, gaveWay: [] };
  const days = itinerary.days.map((day) => holdDay(day, held, travel));
  return {
    itinerary: { ...itinerary, days: days.map((d) => d.day) },
    gaveWay: days.flatMap((d) => d.gaveWay),
  };
}

/**
 * Brings the rows of a version the guide wrote in line with the draft it was made from: a stop
 * that was already there keeps what the planner's item does not carry (who is going, a dropped
 * pin, its lane and flags, whose stop it is, its lock), a stop of hers keeps its own category, and
 * a stop of hers the planner never saw (one with no time yet) is copied over. Run as the system
 * after the version's days and items are written.
 */
export async function carryBaseRows(
  tx: pg.PoolClient,
  baseVersionId: string,
  versionId: string,
): Promise<void> {
  await tx.query(
    `UPDATE plan_items n
        SET attendee_ids = o.attendee_ids, custom_place = o.custom_place, lane = o.lane,
            provider_id = o.provider_id, flexibility = o.flexibility, is_outdoor = o.is_outdoor,
            created_by_kind = o.created_by_kind, locked_reason = o.locked_reason, status = o.status,
            category = CASE WHEN o.created_by_kind = 'user' THEN o.category ELSE n.category END,
            i18n = CASE WHEN o.notes IS NOT DISTINCT FROM n.notes THEN o.i18n ELSE n.i18n END
       FROM plan_items o
      WHERE n.version_id = $2 AND o.version_id = $1 AND o.stable_id = n.stable_id`,
    [baseVersionId, versionId],
  );
  await tx.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz, lane,
       attendee_ids, poi_id, custom_place, provider_id, booking_id, must_do_id, category,
       cost_model, amount_minor, currency, status, flexibility, is_outdoor, created_by_kind,
       notes, locked_reason, i18n)
     SELECT $2, nd.id, i.trip_id, i.stable_id, i.starts_at, i.ends_at, i.tz, i.lane,
            i.attendee_ids, i.poi_id, i.custom_place, i.provider_id, i.booking_id, i.must_do_id,
            i.category, i.cost_model, i.amount_minor, i.currency, i.status, i.flexibility,
            i.is_outdoor, i.created_by_kind, i.notes, i.locked_reason, i.i18n
       FROM plan_items i
       JOIN plan_days od ON od.id = i.day_id
       JOIN plan_days nd ON nd.version_id = $2 AND nd.day_no = od.day_no
      WHERE i.version_id = $1 AND ${HELD_ROW_SQL}
        AND NOT EXISTS (SELECT 1 FROM plan_items n
                         WHERE n.version_id = $2 AND n.stable_id = i.stable_id)`,
    [baseVersionId, versionId],
  );
}
