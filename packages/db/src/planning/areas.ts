/**
 * The areas of a trip: its main destination, its stops in order (a trip with no stop rows has one,
 * its destination), and for each day of a plan version the stop it belongs to, the area it is spent
 * in and, for a day trip, the link that leads there. `app.trip_area_ids` answers the same set of
 * destinations for readers written in SQL.
 *
 * A day's area is `plan_days.destination_id` when set, else its stop's destination. A day whose
 * area is not its stop's city is a day trip; its link is the `day_trip` link from the stop to the
 * area, or null when there is none any more (readers then show the area with no travel line).
 * Nothing here reads `trip.areas`: with no rows the answer is the trip's destination alone.
 * Callers checked access. A stop's guide comes from a system function: a caller reading as the
 * traveller passes `withGuides: false` and gets no guide ids.
 */
import { stopDayRanges, stopIndexOfDay } from '@cp/domain';
import type pg from 'pg';

export interface AreaLink {
  readonly id: string;
  readonly fromDestinationId: string;
  readonly toDestinationId: string;
  readonly kind: 'day_trip' | 'onward';
  readonly minutes: number;
  readonly mode: string;
  readonly dayLength: 'half' | 'full' | null;
  readonly costPpMinor: number | null;
  readonly costCurrency: string | null;
  readonly note: string | null;
  /** Written from web pages and shown as an estimate (an editor's row is not). */
  readonly estimate: boolean;
}

export interface TripStopArea {
  readonly position: number;
  readonly destinationId: string;
  readonly nights: number;
  readonly firstDay: number;
  readonly lastDay: number;
  readonly guideId: string | null;
  /** The onward link from the stop before; null for the first stop or when none is known. */
  readonly onwardLink: AreaLink | null;
}

export interface TripDayArea {
  readonly dayId: string;
  readonly dayNo: number;
  readonly areaId: string;
  readonly stopPosition: number;
  /** Set for a day trip: how to get from the stop to the area. */
  readonly link: AreaLink | null;
}

export interface TripAreas {
  readonly tripId: string;
  readonly destinationId: string;
  readonly stops: readonly TripStopArea[];
  readonly days: readonly TripDayArea[];
  /** Every destination the trip may use: its own, its stops' and its days' areas. */
  readonly areaIds: readonly string[];
}

interface LinkRow {
  readonly id: string;
  readonly from_destination_id: string;
  readonly to_destination_id: string;
  readonly kind: 'day_trip' | 'onward';
  readonly minutes: number;
  readonly mode: string;
  readonly day_length: 'half' | 'full' | null;
  readonly cost_pp_minor: string | null;
  readonly cost_currency: string | null;
  readonly note: string | null;
  readonly origin: string;
}

const toLink = (row: LinkRow): AreaLink => ({
  id: row.id,
  fromDestinationId: row.from_destination_id,
  toDestinationId: row.to_destination_id,
  kind: row.kind,
  minutes: row.minutes,
  mode: row.mode,
  dayLength: row.day_length,
  costPpMinor: row.cost_pp_minor === null ? null : Number(row.cost_pp_minor),
  costCurrency: row.cost_currency,
  note: row.note,
  estimate: row.origin !== 'editorial',
});

const linkKey = (kind: string, from: string, to: string): string => `${kind}:${from}>${to}`;

/** The trip's areas over a plan version (default: the crew plan, else the organiser's draft). */
export async function tripAreas(
  tx: pg.PoolClient,
  tripId: string,
  versionId?: string,
  options: { readonly withGuides?: boolean } = {},
): Promise<TripAreas | null> {
  const trip = await tx.query<{
    destination_id: string | null;
    version_id: string | null;
    trip_days: number | null;
  }>(
    `SELECT destination_id, coalesce($2::uuid, current_version_id, draft_version_id) AS version_id,
            (end_date - start_date) + 1 AS trip_days
       FROM trips WHERE id = $1`,
    [tripId, versionId ?? null],
  );
  const head = trip.rows[0];
  if (head?.destination_id == null) return null;
  const [stopRows, dayRows] = await Promise.all([
    tx.query<{ position: number; destination_id: string; nights: number }>(
      `SELECT position, destination_id, nights FROM trip_stops WHERE trip_id = $1 ORDER BY position`,
      [tripId],
    ),
    head.version_id === null
      ? Promise.resolve({
          rows: [] as { id: string; day_no: number; destination_id: string | null }[],
        })
      : tx.query<{ id: string; day_no: number; destination_id: string | null }>(
          `SELECT id, day_no, destination_id FROM plan_days
            WHERE version_id = $1 AND trip_id = $2 ORDER BY day_no`,
          [head.version_id, tripId],
        ),
  ]);
  const dayCount = Math.max(head.trip_days ?? 0, dayRows.rows.at(-1)?.day_no ?? 0, 1);
  const stopsIn =
    stopRows.rows.length > 0
      ? stopRows.rows
      : [{ position: 1, destination_id: head.destination_id, nights: Math.max(1, dayCount - 1) }];
  const guides = new Map<string, string | null>();
  if (options.withGuides !== false) {
    const { rows } = await tx.query<{ id: string; guide_id: string | null }>(
      'SELECT id, app.destination_guide_id(id) AS guide_id FROM unnest($1::uuid[]) AS id',
      [stopsIn.map((stop) => stop.destination_id)],
    );
    for (const row of rows) guides.set(row.id, row.guide_id);
  }
  const stopIds = stopsIn.map((stop) => stop.destination_id);
  const dayAreaIds = dayRows.rows.flatMap((day) =>
    day.destination_id === null ? [] : [day.destination_id],
  );
  const { rows: linkRows } = await tx.query<LinkRow>(
    `SELECT id, from_destination_id, to_destination_id, kind, minutes, mode, day_length,
            cost_pp_minor::text, cost_currency, note, origin
       FROM destination_links
      WHERE from_destination_id = ANY($1::uuid[])
        AND ((kind = 'day_trip' AND to_destination_id = ANY($2::uuid[]))
          OR (kind = 'onward' AND to_destination_id = ANY($1::uuid[])))`,
    [stopIds, dayAreaIds],
  );
  const links = new Map(
    linkRows.map((row) => [
      linkKey(row.kind, row.from_destination_id, row.to_destination_id),
      toLink(row),
    ]),
  );
  const ranges = stopDayRanges(stopsIn, dayCount);
  const stops: TripStopArea[] = stopsIn.map((stop, index) => {
    const before = stopsIn[index - 1];
    const range = ranges[index] ?? { first: 1, last: dayCount };
    return {
      position: stop.position,
      destinationId: stop.destination_id,
      nights: stop.nights,
      firstDay: range.first,
      lastDay: range.last,
      guideId: guides.get(stop.destination_id) ?? null,
      onwardLink:
        before === undefined
          ? null
          : (links.get(linkKey('onward', before.destination_id, stop.destination_id)) ?? null),
    };
  });
  const days: TripDayArea[] = dayRows.rows.flatMap((day) => {
    const stop = stops[stopIndexOfDay(stopsIn, day.day_no)];
    if (stop === undefined) return [];
    const areaId = day.destination_id ?? stop.destinationId;
    const area: TripDayArea = {
      dayId: day.id,
      dayNo: day.day_no,
      areaId,
      stopPosition: stop.position,
      link:
        areaId === stop.destinationId
          ? null
          : (links.get(linkKey('day_trip', stop.destinationId, areaId)) ?? null),
    };
    return [area];
  });
  return {
    tripId,
    destinationId: head.destination_id,
    stops,
    days,
    areaIds: [...new Set([head.destination_id, ...stopIds, ...dayAreaIds])],
  };
}

/** One day's area, stop and link, over the version the day belongs to (any caller role). */
export async function dayArea(
  tx: pg.PoolClient,
  tripId: string,
  dayId: string,
): Promise<TripDayArea | null> {
  const { rows } = await tx.query<{ version_id: string }>(
    'SELECT version_id FROM plan_days WHERE id = $1 AND trip_id = $2',
    [dayId, tripId],
  );
  const versionId = rows[0]?.version_id;
  if (versionId === undefined) return null;
  const areas = await tripAreas(tx, tripId, versionId, { withGuides: false });
  return areas?.days.find((day) => day.dayId === dayId) ?? null;
}

/** Every destination a trip may use, as `app.trip_area_ids` answers it. */
export async function tripAreaIds(
  tx: pg.PoolClient,
  tripId: string,
  withDrafts = false,
): Promise<string[]> {
  const { rows } = await tx.query<{ id: string }>('SELECT app.trip_area_ids($1, $2) AS id', [
    tripId,
    withDrafts,
  ]);
  return rows.map((row) => row.id);
}
