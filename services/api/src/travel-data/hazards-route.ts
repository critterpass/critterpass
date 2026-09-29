/**
 * `GET /v1/hazards?destination_id` (doc delta beside docs/api-contracts.md §5.5): the destination's
 * current curated hazard alerts (volcano levels, weather warnings), highest level first, each with
 * its official source link, issue time and when it was last read. Expired readings (a CENAPRED
 * report or GDACS event past its expiry) are left out; an alert not read for three hours is flagged
 * stale, never dropped.
 */
import { withUser } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { requireCommandSession } from '../commands/_framework/session';
import { resolveDestination } from './destination-ref';
import type { TravelDataRouteDeps } from './routes';

export const HAZARD_STALE_HOURS = 3;

export interface HazardView {
  readonly id: string;
  readonly kind: string;
  readonly subject: string;
  readonly level: number;
  readonly level_label: string;
  readonly headline: string;
  readonly source: string;
  readonly source_url: string;
  readonly issued_at: string;
  readonly expires_at: string | null;
  readonly fetched_at: string;
  readonly stale: boolean;
}

export async function readHazards(
  tx: pg.PoolClient,
  destinationId: string,
  now: Date = new Date(),
): Promise<HazardView[]> {
  const { rows } = await tx.query<
    Omit<HazardView, 'issued_at' | 'expires_at' | 'fetched_at' | 'stale'> & {
      issued_at: Date;
      expires_at: Date | null;
      fetched_at: Date;
    }
  >(
    `SELECT id, kind, subject, level, level_label, headline, source, source_url, issued_at,
            expires_at, fetched_at
       FROM hazard_alerts
      WHERE destination_id = $1 AND (expires_at IS NULL OR expires_at > $2)
      ORDER BY level DESC, subject, source`,
    [destinationId, now],
  );
  return rows.map((row) => ({
    ...row,
    issued_at: row.issued_at.toISOString(),
    expires_at: row.expires_at?.toISOString() ?? null,
    fetched_at: row.fetched_at.toISOString(),
    stale: now.getTime() - row.fetched_at.getTime() > HAZARD_STALE_HOURS * 3_600_000,
  }));
}

const hazardsQuerySchema = z.object({ destination_id: z.string().min(1) });

export function registerHazardsRoute(app: OpenAPIHono<AppEnv>, deps: TravelDataRouteDeps): void {
  app.get('/v1/hazards', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const query = hazardsQuerySchema.parse(c.req.query());
    const body = await withUser(deps.pool, session.uid, 'unknown', async (tx) => {
      const destination = await resolveDestination(tx, query.destination_id);
      return { destination_id: destination.id, alerts: await readHazards(tx, destination.id) };
    });
    c.header('Cache-Control', 'private, max-age=900');
    return c.json(body);
  });
}
