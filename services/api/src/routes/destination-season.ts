/**
 * `GET /v1/destinations/{id}/season` (docs/api-contracts.md §5.5): a destination's reviewed month
 * curve and its reviewed events, the rows the catalogue stream syncs. `{id}` is the destination's
 * id or slug. Unreviewed rows never leave the server: RLS hides them and the filters say so too.
 */
import { withUser } from '@cp/db';
import type { SeasonColourRole } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';

import type { AppEnv } from '../app';
import { requireCommandSession } from '../commands/_framework/session';
import { resolveDestination } from '../travel-data/destination-ref';
import { sendSharedContent } from './shared-content-cache';
import type { SharedContentDeps } from './shared-content';

export interface SeasonMonth {
  readonly month: number;
  readonly crowd_index: number;
  readonly price_index: number | null;
  readonly price_index_source: 'editorial' | 'fares';
  readonly highlight_tag: string | null;
  readonly colour_role: SeasonColourRole;
  readonly source: string;
  readonly source_url: string | null;
  readonly sourced_on: string;
  readonly reviewed_at: string;
}

export interface SeasonEvent {
  readonly key: string;
  readonly kind: string;
  readonly name: string;
  readonly starts_on: string;
  readonly ends_on: string;
  readonly confidence: string;
  readonly source: string;
  readonly source_url: string | null;
  readonly sourced_on: string;
  readonly forecast_updated_at: string | null;
  readonly reviewed_at: string;
}

export interface DestinationSeason {
  readonly destination_id: string;
  readonly months: readonly SeasonMonth[];
  readonly events: readonly SeasonEvent[];
}

export function registerDestinationSeasonRoute(
  app: OpenAPIHono<AppEnv>,
  deps: SharedContentDeps,
): void {
  app.get('/v1/destinations/:id/season', async (c) => {
    const { uid } = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const body = await withUser(deps.pool, uid, 'unknown', async (tx) => {
      const destination = await resolveDestination(tx, c.req.param('id'));
      const months = await tx.query<Omit<SeasonMonth, 'reviewed_at'> & { reviewed_at: Date }>(
        `SELECT month, crowd_index, price_index, price_index_source, highlight_tag, colour_role,
                source, source_url, sourced_on::text, reviewed_at
           FROM season_months WHERE destination_id = $1 AND reviewed_at IS NOT NULL
          ORDER BY month`,
        [destination.id],
      );
      const events = await tx.query<
        Omit<SeasonEvent, 'reviewed_at' | 'forecast_updated_at'> & {
          forecast_updated_at: Date | null;
          reviewed_at: Date;
        }
      >(
        `SELECT key, kind, name, starts_on::text, ends_on::text, confidence, source, source_url,
                sourced_on::text, forecast_updated_at, reviewed_at
           FROM season_events WHERE destination_id = $1 AND reviewed_at IS NOT NULL
          ORDER BY starts_on, key`,
        [destination.id],
      );
      const season: DestinationSeason = {
        destination_id: destination.id,
        months: months.rows.map((row) => ({ ...row, reviewed_at: row.reviewed_at.toISOString() })),
        events: events.rows.map((row) => ({
          ...row,
          forecast_updated_at: row.forecast_updated_at?.toISOString() ?? null,
          reviewed_at: row.reviewed_at.toISOString(),
        })),
      };
      return season;
    });
    return sendSharedContent(c, body);
  });
}
