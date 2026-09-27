/**
 * Trip cost reads (docs/api-contracts.md §5.5): `GET /v1/trips/{id}/costs` returns the stored calc
 * as the caller may see it — their own share with its lines and personal option deltas, every
 * member's total, the components and how fresh they are — and `POST /v1/trips/{id}/costs/preview`
 * prices ChangeSet ops for the caller. Everything runs as `app_user`, so RLS decides who sees what.
 */
import { withUser } from '@cp/db';
import { changeSetOpsSchema, DomainError } from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';
import { loadPlanCostContext, previewCostOps } from './preview';

export interface CostRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
}

/** Live prices older than this are flagged in `freshness` (editorial and booked ones never are). */
const STALE_AFTER_MS = 72 * 3_600_000;

const tripParams = z.object({ id: z.uuid() });
const previewBody = z.object({ ops: changeSetOpsSchema });

const num = (value: string | null) => (value === null ? null : Number(value));

async function readCosts(tx: pg.PoolClient, tripId: string, uid: string, now: Date) {
  const trip = await tx.query('SELECT 1 FROM trips WHERE id = $1', [tripId]);
  if (trip.rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'trip_not_found' });
  const components = await tx.query<{
    component_key: string;
    kind: string;
    unit: string;
    is_shared: boolean;
    origin: string | null;
    amount_minor: string | null;
    currency: string;
    source: string;
    label: string | null;
    seen_at: Date;
    frozen_at: Date | null;
    calc_version: string;
  }>(
    `SELECT component_key, kind, unit, is_shared, origin, amount_minor, currency, source, label,
            seen_at, frozen_at, calc_version
       FROM cost_components WHERE trip_id = $1 ORDER BY component_key`,
    [tripId],
  );
  const totals = await tx.query<{
    user_id: string;
    total_minor: string;
    currency: string;
    is_missing: boolean;
    calc_version: string;
  }>(
    `SELECT user_id, total_minor, currency, is_missing, calc_version
       FROM trip_share_totals WHERE trip_id = $1 ORDER BY user_id`,
    [tripId],
  );
  const mine = await tx.query<{
    version: string;
    components: { component_key: string; kind: string; amount_minor: string | null }[];
    personal_option_deltas: unknown[];
    total_minor: string;
    currency: string;
    fx_snapshot_id: string | null;
    is_missing: boolean;
    is_estimated_origin: boolean;
    is_stale: boolean;
  }>(
    `SELECT version, components, personal_option_deltas, total_minor, currency, fx_snapshot_id,
            is_missing, is_estimated_origin, is_stale
       FROM share_calcs WHERE trip_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [tripId, uid],
  );
  const live = components.rows.filter((c) => c.source !== 'editorial' && c.source !== 'booking');
  const oldest = live.reduce<Date | null>(
    (min, c) => (min === null || c.seen_at < min ? c.seen_at : min),
    null,
  );
  const own = mine.rows[0];
  return {
    trip_id: tripId,
    version: totals.rows[0]?.calc_version ?? components.rows[0]?.calc_version ?? null,
    mine: own
      ? {
          total: { amount_minor: Number(own.total_minor), currency: own.currency },
          lines: own.components.map((line) => ({
            component_key: line.component_key,
            kind: line.kind,
            amount_minor: num(line.amount_minor),
          })),
          personal_option_deltas: own.personal_option_deltas,
          fx_snapshot_id: own.fx_snapshot_id,
          is_missing: own.is_missing,
          is_estimated_origin: own.is_estimated_origin,
          is_stale: own.is_stale,
        }
      : null,
    totals: totals.rows.map((t) => ({
      user_id: t.user_id,
      total: { amount_minor: Number(t.total_minor), currency: t.currency },
      is_missing: t.is_missing,
    })),
    components: components.rows.map((c) => ({
      component_key: c.component_key,
      kind: c.kind,
      unit: c.unit,
      is_shared: c.is_shared,
      origin: c.origin,
      amount:
        c.amount_minor === null
          ? null
          : { amount_minor: Number(c.amount_minor), currency: c.currency },
      source: c.source,
      label: c.label,
      seen_at: c.seen_at.toISOString(),
      frozen_at: c.frozen_at?.toISOString() ?? null,
    })),
    freshness: {
      oldest_seen_at: oldest?.toISOString() ?? null,
      stale: oldest !== null && now.getTime() - oldest.getTime() > STALE_AFTER_MS,
    },
  };
}

export function registerCostRoutes(app: OpenAPIHono<AppEnv>, deps: CostRouteDeps): void {
  app.get('/v1/trips/:id/costs', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const { id } = tripParams.parse(c.req.param());
    const body = await withUser(deps.pool, session.uid, 'unknown', (tx) =>
      readCosts(tx, id, session.uid, new Date()),
    );
    const version = c.req.query('version');
    if (version !== undefined && body.version !== version) {
      throw new DomainError('VERSION_CONFLICT', { current: body.version });
    }
    c.header('Cache-Control', 'private, no-cache');
    return c.json(body);
  });

  app.post('/v1/trips/:id/costs/preview', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const { id } = tripParams.parse(c.req.param());
    const { ops } = previewBody.parse(await c.req.json());
    const preview = await withUser(deps.pool, session.uid, 'unknown', async (tx) =>
      previewCostOps(await loadPlanCostContext(tx, id), ops, session.uid),
    );
    return c.json(preview);
  });
}
