/**
 * A trip's days before any draft: the empty plan a trip gets when its dates lock, and what happens
 * to a plan the organiser already built when the dates change under it.
 *
 * A dates change never loses a stop. Every stop keeps its day number and its local time of day on
 * the new dates. A stop on a day the shorter trip no longer has goes back to Ideas when it is a
 * place of ours, and otherwise moves to the last day; the caller is told which stops moved and
 * where. Booked stops follow their bookings, not this rule.
 *
 * On a trip with several stops the stops are refitted to the new nights first, and every day is
 * then seated in its stop: it takes its stop's city, or keeps a day trip that still leaves from it.
 */
import { dropReplacedDraft, writeBookedPlanItems } from '@cp/db';
import {
  seatDayArea,
  stopIndexOfDay,
  type MovedStop,
  type PlanState,
  type PlanStateItem,
  type StopCity,
} from '@cp/domain';
import type pg from 'pg';

import { backIdea, type IdeaPlace } from '../commands/ideas';
import { outsideToIdeas, type Editor } from '../planning/areas/day-area-change';
import {
  createEmptyDraft,
  draftChanged,
  writeDraftVersion,
  type DraftHead,
  type StopRow,
} from './draft-versioning';
import { loadPlanState } from './versioning';

export interface EnsuredDays {
  readonly versionId: string | null;
  readonly created: boolean;
}

/**
 * Gives the trip its empty plan when it has locked dates and no plan of any kind; a trip that has
 * a draft or a crew plan is left alone. Runs as the system, under the trip lock.
 */
export async function ensureDraftDays(tx: pg.PoolClient, head: DraftHead): Promise<EnsuredDays> {
  const existing = head.currentVersionId ?? head.draftVersionId;
  if (existing !== null) return { versionId: existing, created: false };
  if (head.startDate === null || head.endDate === null) return { versionId: null, created: false };
  return { versionId: await createEmptyDraft(tx, head), created: true };
}

function daysApart(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);
}

async function placeOf(tx: pg.PoolClient, poiId: string): Promise<IdeaPlace | null> {
  const { rows } = await tx.query<IdeaPlace>(
    `SELECT id AS "poiId", name, name_local AS "nameLocal", category, lat, lng
       FROM pois WHERE id = $1 AND status = 'active'`,
    [poiId],
  );
  return rows[0] ?? null;
}

/** Each kept stop at the same local time of day on its day's new date. */
async function onNewDates(
  tx: pg.PoolClient,
  baseVersionId: string,
  start: string,
  tz: string,
  kept: readonly PlanStateItem[],
): Promise<PlanStateItem[]> {
  const { rows } = await tx.query<{
    stable_id: string;
    starts_at: Date | null;
    ends_at: Date | null;
  }>(
    `SELECT o.stable_id,
            ((o.starts_at AT TIME ZONE z.tz) + make_interval(days => z.shift)) AT TIME ZONE z.tz AS starts_at,
            ((o.ends_at AT TIME ZONE z.tz) + make_interval(days => z.shift)) AT TIME ZONE z.tz AS ends_at
       FROM jsonb_to_recordset($2::jsonb) AS r(stable_id uuid, day_no int)
       JOIN plan_items o ON o.version_id = $1 AND o.stable_id = r.stable_id
       JOIN plan_days od ON od.id = o.day_id
       CROSS JOIN LATERAL (
         SELECT coalesce(o.tz, $4) AS tz,
                coalesce(($3::date + (r.day_no - 1)) - od.date, 0) AS shift
       ) z`,
    [
      baseVersionId,
      JSON.stringify(kept.map((item) => ({ stable_id: item.stable_id, day_no: item.day_no }))),
      start,
      tz,
    ],
  );
  const times = new Map(rows.map((row) => [row.stable_id, row]));
  return kept.map((item) => {
    const at = times.get(item.stable_id);
    if (at === undefined || at.starts_at === null || at.ends_at === null) return item;
    return { ...item, starts_at: at.starts_at.toISOString(), ends_at: at.ends_at.toISOString() };
  });
}

export interface SeatDays extends Editor {
  /** The trip's own destination: the one stop of a trip with no stop rows. */
  readonly destinationId: string;
  readonly state: PlanState;
  readonly before: readonly StopRow[];
  readonly after: readonly StopRow[];
}

/**
 * Seats every day of a plan in the trip's stops as they now are: a day keeps a day trip that
 * still leaves from its stop and otherwise takes its stop's city, and the stops of a day whose
 * city changed go back to Ideas when their place is outside it. Runs as the system.
 */
export async function seatDays(
  tx: pg.PoolClient,
  input: SeatDays,
): Promise<{ next: PlanState; moved: MovedStop[] }> {
  const asStops = (rows: readonly StopRow[]): StopCity[] =>
    rows.length > 0
      ? rows.map((row) => ({ destinationId: row.destination_id, nights: row.nights }))
      : [{ destinationId: input.destinationId, nights: 1 }];
  const before = asStops(input.before);
  const after = asStops(input.after);
  const cityOf = (stops: readonly StopCity[], dayNo: number, area: string | null): string =>
    area ?? stops[stopIndexOfDay(stops, dayNo)]?.destinationId ?? input.destinationId;
  const { rows: links } = await tx.query<{ from_id: string; to_id: string }>(
    `SELECT from_destination_id AS from_id, to_destination_id AS to_id FROM destination_links
      WHERE kind = 'day_trip' AND from_destination_id = ANY($1::uuid[])
        AND to_destination_id = ANY($2::uuid[])`,
    [
      after.map((stop) => stop.destinationId),
      input.state.days.flatMap((day) => (day.destination_id == null ? [] : [day.destination_id])),
    ],
  );
  const dayTrips = new Set(links.map((link) => `${link.from_id}>${link.to_id}`));
  const changed = new Map<number, string>();
  const days = input.state.days.map((day) => {
    const { destination_id: old, ...rest } = day;
    const seated = seatDayArea(after, day.day_no, old ?? null, (from, to) =>
      dayTrips.has(`${from}>${to}`),
    );
    const city = cityOf(after, day.day_no, seated);
    if (city !== cityOf(before, day.day_no, old ?? null)) changed.set(day.day_no, city);
    return seated === null ? rest : { ...rest, destination_id: seated };
  });
  const { moved, leaving } = await outsideToIdeas(tx, input, input.state.items, (dayNo) =>
    changed.get(dayNo),
  );
  return {
    next: { days, items: input.state.items.filter((item) => !leaving.has(item.stable_id)) },
    moved,
  };
}

export interface ReshapeInput {
  readonly head: DraftHead;
  readonly start: string;
  readonly end: string;
  readonly tz: string;
  readonly actorId: string;
  /** The trip's stops before and after the dates changed, when it had any; its own destination. */
  readonly seat?: Pick<SeatDays, 'before' | 'after' | 'destinationId'>;
}

/**
 * Puts the trip's draft on its new dates (the trip row already carries them) and returns the
 * stops that could not stay on their day. Runs as the system, under the trip lock.
 */
export async function reshapeDraftDays(
  tx: pg.PoolClient,
  input: ReshapeInput,
): Promise<readonly MovedStop[]> {
  const { head, start, end } = input;
  const base = head.draftVersionId;
  if (base === null) return [];
  const state = await loadPlanState(tx, base);
  const length = daysApart(start, end) + 1;
  const stops = state.items.filter((item) => item.booking_id == null);
  if (stops.length === 0) {
    // Nothing of hers to carry: a fresh empty plan, with her bookings laid on.
    await tx.query("UPDATE itinerary_versions SET status = 'superseded' WHERE id = $1", [base]);
    const fresh = await createEmptyDraft(tx, { ...head, startDate: start, endDate: end });
    await dropReplacedDraft(tx, base);
    await writeBookedPlanItems(tx, head.tripId, fresh);
    return [];
  }
  // A day keeps its theme and its area on its day number, as a stop does.
  const before = new Map(state.days.map((day) => [day.day_no, day]));
  const moved: MovedStop[] = [];
  const kept: PlanStateItem[] = [];
  for (const item of stops) {
    if (item.day_no <= length) {
      kept.push(item);
      continue;
    }
    const place = item.poi_id == null ? null : await placeOf(tx, item.poi_id);
    if (place === null) {
      kept.push({ ...item, day_no: length });
      moved.push({ stable_id: item.stable_id, to: 'day', day_no: length });
      continue;
    }
    await backIdea(tx, {
      tripId: head.tripId,
      crewId: head.crewId,
      uid: input.actorId,
      place,
      source: 'save',
    });
    moved.push({ stable_id: item.stable_id, to: 'ideas' });
  }
  const onDates: PlanState = {
    days: Array.from({ length }, (_, index) => {
      const day = before.get(index + 1);
      const area = day?.destination_id;
      return {
        day_no: index + 1,
        date: addDays(start, index),
        theme: day?.theme ?? null,
        ...(area == null ? {} : { destination_id: area }),
      };
    }),
    items: await onNewDates(tx, base, start, input.tz, kept),
  };
  const seated =
    input.seat === undefined
      ? { next: onDates, moved: [] }
      : await seatDays(tx, {
          tripId: head.tripId,
          crewId: head.crewId,
          uid: input.actorId,
          state: onDates,
          ...input.seat,
        });
  const { next } = seated;
  moved.push(...seated.moved);
  const versionId = await writeDraftVersion(tx, {
    head,
    baseVersionId: base,
    next,
    origin: 'hand',
  });
  await writeBookedPlanItems(tx, head.tripId, versionId);
  await draftChanged(tx, {
    head,
    versionId,
    baseVersionId: base,
    opCount: kept.length,
    actorId: input.actorId,
  });
  return moved;
}
