/**
 * `GET /v1/places/{id}/crowd-forecasts` (docs/api-contracts.md §5.5): every weekly crowd curve a
 * place has, the rows the trip pack syncs, for the phone to pick from as it does from its own copy
 * (`pickCrowdCurve`). An editorial curve shows only once ops approved it (RLS and the filter agree);
 * visit curves exist only from five crews up. An unknown place is `NOT_FOUND`.
 */
import { withUser } from '@cp/db';
import { DomainError } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { requireCommandSession } from '../commands/_framework/session';
import { sendSharedContent } from './shared-content-cache';
import type { SharedContentDeps } from './shared-content';

export interface CrowdCurve {
  readonly dow: number;
  /** 24 values (0–100, index = local hour). */
  readonly hourly: readonly number[];
  readonly source: 'besttime' | 'editorial' | 'visits';
  readonly fetched_at: string;
  readonly approved_at: string | null;
  readonly crew_count: number | null;
}

export interface PlaceCrowdForecasts {
  readonly poi_id: string;
  readonly curves: readonly CrowdCurve[];
}

type CurveRow = Omit<CrowdCurve, 'fetched_at' | 'approved_at'> & {
  fetched_at: Date;
  approved_at: Date | null;
};

export function registerPlaceCrowdForecastsRoute(
  app: OpenAPIHono<AppEnv>,
  deps: SharedContentDeps,
): void {
  app.get('/v1/places/:id/crowd-forecasts', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const parsed = z.uuid().safeParse(c.req.param('id'));
    if (!parsed.success) throw new DomainError('NOT_FOUND');
    const poiId = parsed.data;
    const body = await withUser(deps.pool, uid, 'unknown', async (tx) => {
      const place = await tx.query('SELECT 1 FROM pois WHERE id = $1', [poiId]);
      if (place.rowCount === 0) throw new DomainError('NOT_FOUND');
      const { rows } = await tx.query<CurveRow>(
        `SELECT dow, hourly, source, fetched_at, approved_at, crew_count FROM crowd_forecasts
          WHERE poi_id = $1 AND (source <> 'editorial' OR approved_at IS NOT NULL)
          ORDER BY dow, source`,
        [poiId],
      );
      const forecasts: PlaceCrowdForecasts = {
        poi_id: poiId,
        curves: rows.map((row) => ({
          ...row,
          fetched_at: row.fetched_at.toISOString(),
          approved_at: row.approved_at?.toISOString() ?? null,
        })),
      };
      return forecasts;
    });
    return sendSharedContent(c, body);
  });
}
