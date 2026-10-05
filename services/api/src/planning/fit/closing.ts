/**
 * Whether stops at proposed times are open for their whole visit (`POST
 * /v1/trips/{id}/plan/opening-check`, doc delta in docs/api-contracts-planning.md): a stop that a
 * push would start after its place closes, or end after it, is named with its closing time. Only
 * a place's own known hours count; a place with none, and a stop with no place, never do, so the
 * check never warns on a guess.
 */
import { knownHours, openSpans, openThrough, toLocalWallTime, type Hours } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

export const openingCheckBodySchema = z.strictObject({
  stops: z
    .array(
      z.strictObject({
        key: z.string().min(1).max(64),
        poi_id: z.uuid(),
        starts_at: z.iso.datetime({ offset: true }),
        ends_at: z.iso.datetime({ offset: true }),
      }),
    )
    .min(1)
    .max(50),
});
export type OpeningCheckBody = z.infer<typeof openingCheckBodySchema>;

export interface ClosedStop {
  readonly key: string;
  /** Local `HH:MM` the place closes that day; null when it does not open that day at all. */
  readonly closes: string | null;
}

const clock = (minutes: number) =>
  `${String(Math.floor((minutes % 1440) / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const minuteOf = (time: string) => {
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  return hour * 60 + minute;
};

/** The stops that are not open for their whole visit, with when their place closes. */
export function closedStops(
  stops: OpeningCheckBody['stops'],
  hoursOf: ReadonlyMap<string, Hours>,
  tz: string,
): ClosedStop[] {
  return stops.flatMap((stop): ClosedStop[] => {
    const hours = hoursOf.get(stop.poi_id);
    if (hours === undefined) return [];
    const from = toLocalWallTime(new Date(stop.starts_at), tz);
    const to = toLocalWallTime(new Date(stop.ends_at), tz);
    const start = minuteOf(from.time);
    const end = to.date === from.date ? minuteOf(to.time) : 1440 + minuteOf(to.time);
    const spans = openSpans(hours, from.date);
    if (openThrough(spans, start, end) !== null) return [];
    const last = [...spans].filter((span) => span.start <= start).at(-1) ?? spans.at(-1) ?? null;
    return [{ key: stop.key, closes: last === null ? null : clock(last.end) }];
  });
}

export async function readKnownHours(
  tx: pg.PoolClient,
  poiIds: readonly string[],
): Promise<Map<string, Hours>> {
  const { rows } = await tx.query<{ id: string; hours: unknown }>(
    'SELECT id, hours FROM pois WHERE id = ANY($1::uuid[])',
    [[...new Set(poiIds)]],
  );
  return new Map(
    rows.flatMap((row) => {
      const hours = knownHours(row.hours);
      return hours === null ? [] : [[row.id, hours] as const];
    }),
  );
}
