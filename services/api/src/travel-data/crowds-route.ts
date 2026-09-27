/**
 * `GET /v1/places/{id}/crowds?date` (docs/api-contracts.md §5.5) and the `crowd_forecast` tool's
 * read. Hourly venue crowds have no source at launch, so `hourly` and `best_window` are null and
 * the page shows the destination's reviewed month curve instead (hiding the hourly chart). When a
 * weekly pattern exists in `crowd_forecasts`, `hourly` carries it and `best_window` is the quietest
 * stretch within the place's open hours that day.
 */
import { withUser } from '@cp/db';
import {
  bestWindow,
  DomainError,
  hoursSchema,
  WEEKDAYS,
  type BestWindow,
  type SeasonColourRole,
  type TimeSpan,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { requireCommandSession } from '../commands/_framework/session';
import type { TravelDataRouteDeps } from './routes';

export interface CrowdMonthView {
  readonly month: number;
  readonly crowd_index: number;
  readonly colour_role: SeasonColourRole;
  readonly highlight_tag: string | null;
}

export interface CrowdView {
  readonly poi_id: string;
  readonly date: string;
  /** 24 values (0–100, index = local hour), or null when no hourly source covers the place. */
  readonly hourly: readonly number[] | null;
  readonly best_window: BestWindow | null;
  readonly source: string | null;
  readonly fetched_at: string | null;
  /** The destination's reviewed curve for the date's month, or null without one. */
  readonly month: CrowdMonthView | null;
  readonly curve: readonly CrowdMonthView[] | null;
  readonly curve_source: string | null;
}

/** 0 = Sunday, matching `crowd_forecasts.dow`. */
function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function spansOn(rawHours: unknown, date: string): TimeSpan[] {
  const parsed = hoursSchema.safeParse(rawHours);
  if (!parsed.success) return [];
  const exception = parsed.data.exceptions?.find((entry) => entry.date === date);
  if (exception !== undefined) return exception.spans;
  const weekday = WEEKDAYS[(dayOfWeek(date) + 6) % 7];
  return weekday === undefined ? [] : (parsed.data.weekly[weekday] ?? []);
}

export async function readCrowds(
  tx: pg.PoolClient,
  poiId: string,
  date: string,
): Promise<CrowdView> {
  const poi = (
    await tx.query<{ destination_id: string | null; hours: unknown }>(
      'SELECT destination_id, hours FROM pois WHERE id = $1',
      [poiId],
    )
  ).rows[0];
  if (poi === undefined) throw new DomainError('NOT_FOUND');

  const pattern = (
    await tx.query<{ hourly: number[]; source: string; fetched_at: Date }>(
      'SELECT hourly, source, fetched_at FROM crowd_forecasts WHERE poi_id = $1 AND dow = $2',
      [poiId, dayOfWeek(date)],
    )
  ).rows[0];

  const curveRows =
    poi.destination_id === null
      ? []
      : (
          await tx.query<CrowdMonthView & { source: string }>(
            `SELECT month, crowd_index, colour_role, highlight_tag, source FROM season_months
              WHERE destination_id = $1 AND reviewed_at IS NOT NULL ORDER BY month`,
            [poi.destination_id],
          )
        ).rows;
  const curve = curveRows.map(({ source: _source, ...row }) => row);
  const monthNumber = Number(date.slice(5, 7));

  return {
    poi_id: poiId,
    date,
    hourly: pattern?.hourly ?? null,
    best_window:
      pattern === undefined ? null : bestWindow(pattern.hourly, spansOn(poi.hours, date)),
    source: pattern?.source ?? null,
    fetched_at: pattern?.fetched_at.toISOString() ?? null,
    month: curve.find((row) => row.month === monthNumber) ?? null,
    curve: curve.length === 0 ? null : curve,
    curve_source: curveRows[0]?.source ?? null,
  };
}

const crowdsQuerySchema = z.object({ date: z.iso.date() });

export function registerCrowdsRoute(app: OpenAPIHono<AppEnv>, deps: TravelDataRouteDeps): void {
  app.get('/v1/places/:id/crowds', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const poiId = z.uuid().parse(c.req.param('id'));
    const { date } = crowdsQuerySchema.parse(c.req.query());
    const body = await withUser(deps.pool, session.uid, 'unknown', (tx) =>
      readCrowds(tx, poiId, date),
    );
    c.header('Cache-Control', 'private, max-age=86400');
    return c.json(body);
  });
}
