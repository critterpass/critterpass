/**
 * `GET /v1/destinations/{id}?origins&month&currency` (docs/api-contracts.md §5.5): the destination
 * page's data in one read, re-priced for the crew's airports: the reviewed month curve (`curve:
 * null` when there is none, so the page hides its WHEN TO GO card and shows `best_months`), the
 * reviewed events of the coming year, highlights, per-origin fares for the chosen month with the
 * duration chip, and the FX chip. Every number carries its source and when it was seen.
 */
import { withUser } from '@cp/db';
import {
  FARE_REFRESH_TZ,
  monthKeyIn,
  monthKeySchema,
  nextMonthKeys,
  type SeasonColourRole,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { requireCommandSession } from '../commands/_framework/session';
import { resolveDestination, type ResolvedDestination } from './destination-ref';
import { readFares, type FareView } from './fares-read';
import { originsQuerySchema } from './fares-route';
import { fxChip, type FxConversion } from './fx';
import type { TravelDataRouteDeps } from './routes';

export interface SeasonMonthView {
  readonly month: number;
  readonly crowd_index: number;
  readonly price_index: number | null;
  readonly price_index_source: 'editorial' | 'fares';
  readonly highlight_tag: string | null;
  readonly colour_role: SeasonColourRole;
  readonly source: string;
  readonly source_url: string | null;
  readonly reviewed_at: string;
}

export interface SeasonEventView {
  readonly key: string;
  readonly kind: string;
  readonly name: string;
  readonly starts_on: string;
  readonly ends_on: string;
  readonly confidence: string;
  readonly source: string;
  readonly source_url: string | null;
  readonly forecast_updated_at: string | null;
}

export interface DestinationInsights {
  readonly destination: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly currency: string | null;
    readonly tz: string | null;
  };
  readonly month: string;
  readonly curve: readonly SeasonMonthView[] | null;
  readonly best_months: readonly number[];
  readonly highlights: readonly { readonly month: number; readonly tag: string }[];
  readonly events: readonly SeasonEventView[];
  readonly fares: readonly FareView[];
  readonly fx: FxConversion | null;
}

/** Reviewed rows only (RLS already hides drafts from app_user; this keeps the intent explicit). */
async function readCurve(tx: pg.PoolClient, destinationId: string) {
  const { rows } = await tx.query<Omit<SeasonMonthView, 'reviewed_at'> & { reviewed_at: Date }>(
    `SELECT month, crowd_index, price_index, price_index_source, highlight_tag, colour_role, source,
            source_url, reviewed_at
       FROM season_months WHERE destination_id = $1 AND reviewed_at IS NOT NULL ORDER BY month`,
    [destinationId],
  );
  if (rows.length === 0) return null;
  return rows.map((row) => ({ ...row, reviewed_at: row.reviewed_at.toISOString() }));
}

async function readEvents(tx: pg.PoolClient, destinationId: string, from: string, to: string) {
  const { rows } = await tx.query<SeasonEventView & { forecast_updated_at: Date | null }>(
    `SELECT key, kind, name, starts_on::text, ends_on::text, confidence, source, source_url,
            forecast_updated_at
       FROM season_events
      WHERE destination_id = $1 AND reviewed_at IS NOT NULL
        AND ends_on >= $2::date AND starts_on < $3::date
      ORDER BY starts_on, key`,
    [destinationId, from, to],
  );
  return rows.map((row) => ({
    ...row,
    forecast_updated_at: row.forecast_updated_at?.toISOString() ?? null,
  }));
}

async function callerHomeAirport(tx: pg.PoolClient): Promise<string | null> {
  const { rows } = await tx.query<{ home_airport: string | null }>(
    'SELECT upper(home_airport) AS home_airport FROM users WHERE id = app.uid()',
  );
  const code = rows[0]?.home_airport ?? null;
  return code !== null && /^[A-Z]{3}$/.test(code) ? code : null;
}

export interface DestinationInsightsInput {
  readonly destination: ResolvedDestination;
  readonly origins: readonly string[];
  readonly month: string;
  readonly currency: string;
  readonly now: Date;
}

export async function readDestinationInsights(
  tx: pg.PoolClient,
  input: DestinationInsightsInput,
): Promise<DestinationInsights> {
  const { destination, now } = input;
  const curve = await readCurve(tx, destination.id);
  const first = monthKeyIn(now, FARE_REFRESH_TZ);
  const [lastMonth] = nextMonthKeys(first, 13).slice(-1);
  const events = await readEvents(tx, destination.id, `${first}-01`, `${lastMonth ?? first}-01`);
  const destIata = destination.travel?.airports[0];
  const fares =
    destIata === undefined || input.origins.length === 0
      ? []
      : await readFares(tx, { origins: input.origins, destIata, month: input.month, now });
  const fx =
    destination.currency === null || destination.currency === input.currency
      ? null
      : await fxChip(tx, destination.currency, input.currency, now);
  return {
    destination: {
      id: destination.id,
      slug: destination.slug,
      name: destination.name,
      currency: destination.currency,
      tz: destination.tz,
    },
    month: input.month,
    curve,
    best_months: destination.bestMonths,
    highlights: (curve ?? []).flatMap((row) =>
      row.highlight_tag === null ? [] : [{ month: row.month, tag: row.highlight_tag }],
    ),
    events,
    fares,
    fx,
  };
}

const destinationQuerySchema = z.object({
  origins: originsQuerySchema.optional(),
  month: monthKeySchema.optional(),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase())
    .optional(),
});

export function registerDestinationRoute(
  app: OpenAPIHono<AppEnv>,
  deps: TravelDataRouteDeps,
): void {
  app.get('/v1/destinations/:id', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const query = destinationQuerySchema.parse(c.req.query());
    const now = new Date();
    const body = await withUser(deps.pool, session.uid, 'unknown', async (tx) => {
      const destination = await resolveDestination(tx, c.req.param('id'));
      const home = query.origins === undefined ? await callerHomeAirport(tx) : null;
      return readDestinationInsights(tx, {
        destination,
        origins: query.origins ?? (home === null ? [] : [home]),
        month: query.month ?? nextMonthKeys(monthKeyIn(now, FARE_REFRESH_TZ), 2)[1] ?? '',
        currency: query.currency ?? 'USD',
        now,
      });
    });
    c.header('Cache-Control', 'private, max-age=21600');
    return c.json(body);
  });
}
