/**
 * `GET /v1/destinations/{id}/cost-indices` (docs/api-contracts.md §5.5): a destination's reviewed
 * cost indices, one row per stay type, cheapest first: the rows the catalogue stream syncs. `{id}`
 * is the destination's id or slug. Amounts are minor units of the row's currency.
 */
import { withUser } from '@cp/db';
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import { requireCommandSession } from '../commands/_framework/session';
import { resolveDestination } from '../travel-data/destination-ref';
import { sendSharedContent } from './shared-content-cache';
import type { SharedContentDeps } from './shared-content';

export interface CostIndex {
  readonly stay_type: string;
  readonly nightly_minor_low: number;
  readonly nightly_minor_high: number;
  readonly food_pp_day_minor: number;
  readonly fun_pp_day_minor: number;
  readonly currency: string;
  readonly source: string;
  readonly source_url: string | null;
  readonly sourced_on: string;
  readonly reviewed_at: string;
}

export interface DestinationCostIndices {
  readonly destination_id: string;
  readonly indices: readonly CostIndex[];
}

interface CostIndexRow {
  stay_type: string;
  nightly_minor_low: string;
  nightly_minor_high: string;
  food_pp_day_minor: string;
  fun_pp_day_minor: string;
  currency: string;
  source: string;
  source_url: string | null;
  sourced_on: string;
  reviewed_at: Date;
}

export function registerDestinationCostIndicesRoute(
  app: OpenAPIHono<AppEnv>,
  deps: SharedContentDeps,
): void {
  app.get('/v1/destinations/:id/cost-indices', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const body = await withUser(deps.pool, uid, 'unknown', async (tx) => {
      const destination = await resolveDestination(tx, c.req.param('id'));
      const { rows } = await tx.query<CostIndexRow>(
        `SELECT stay_type, nightly_minor_low, nightly_minor_high, food_pp_day_minor,
                fun_pp_day_minor, currency, source, source_url, sourced_on::text, reviewed_at
           FROM destination_cost_indices WHERE destination_id = $1 AND reviewed_at IS NOT NULL
          ORDER BY nightly_minor_low, stay_type`,
        [destination.id],
      );
      const indices: DestinationCostIndices = {
        destination_id: destination.id,
        indices: rows.map((row) => ({
          ...row,
          nightly_minor_low: Number(row.nightly_minor_low),
          nightly_minor_high: Number(row.nightly_minor_high),
          food_pp_day_minor: Number(row.food_pp_day_minor),
          fun_pp_day_minor: Number(row.fun_pp_day_minor),
          reviewed_at: row.reviewed_at.toISOString(),
        })),
      };
      return indices;
    });
    return sendSharedContent(c, body);
  });
}
