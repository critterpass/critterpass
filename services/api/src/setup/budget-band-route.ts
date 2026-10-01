/**
 * Budget reads (docs/api-contracts.md §5.5):
 * - `GET /v1/budget/{trip_id}/band`: the crew-level band as published, to setup members, only from
 *   four maxes; below that `K_ANON_UNAVAILABLE` with the count ("2 of 6 set") and the public lock
 *   grid (crew currency and step), nothing crew-level.
 * - `GET /v1/setup/{trip_id}/own-fit`: the caller's own fit against the organiser's locked target
 *   ("fits your max" / "over your max"), computed from the caller's max alone.
 * - `GET /v1/me/private/{kind}` (`budget_max?trip_id`, `budget_default`): the owner's own value for
 *   their device's private cache, never anyone else's.
 */
import { ownFit } from '@cp/cost-engine';
import { withUser } from '@cp/db';
import {
  DomainError,
  privateReadKindSchema,
  type BudgetBandUnavailableDetail,
  type BudgetBandWire,
  type OwnFitWire,
  type PrivateBudgetMaxWire,
} from '@cp/domain';
import type { OpenAPIHono } from '@hono/zod-openapi';
import type pg from 'pg';
import { z } from 'zod';

import type { AppEnv } from '../app';
import { loadBudgetEstimates, lockGrid } from '../commands/setup/budget-shared';
import { requireSetupMember } from '../commands/setup/shared';
import { requireCommandSession, type SessionResolver } from '../commands/_framework/session';

export interface BudgetRouteDeps {
  readonly pool: pg.Pool;
  readonly sessions: SessionResolver;
}

const tripParams = z.object({ trip_id: z.uuid() });
const privateQuery = z.object({ trip_id: z.uuid().optional() });
const num = (value: string | null) => (value === null ? 0 : Number(value));

export function registerBudgetRoutes(app: OpenAPIHono<AppEnv>, deps: BudgetRouteDeps): void {
  app.get('/v1/budget/:trip_id/band', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const { trip_id: tripId } = tripParams.parse(c.req.param());
    const body = await withUser(deps.pool, session.uid, 'unknown', async (tx) => {
      await requireSetupMember(tx, tripId, session.uid);
      const { rows } = await tx.query<{
        currency: string;
        maxes_count: number;
        member_count: number;
        band_low_minor: string | null;
        band_high_minor: string | null;
        step_minor: string | null;
        track_high_minor: string | null;
        bucketed_dots: number[] | null;
        under_all_ok: boolean | null;
        infeasible: boolean | null;
        computed_at: Date | null;
      }>('SELECT * FROM trip_budget_aggregates WHERE trip_id = $1', [tripId]);
      const row = rows[0];
      const published =
        row !== undefined &&
        row.maxes_count >= 4 &&
        (row.band_high_minor !== null || row.infeasible === true);
      if (row === undefined || !published) {
        const grid = lockGrid(
          row === undefined
            ? null
            : {
                currency: row.currency,
                stepMinor: row.step_minor === null ? null : BigInt(row.step_minor),
              },
          await loadBudgetEstimates(tx, tripId),
        );
        const detail: BudgetBandUnavailableDetail = {
          maxes_count: row?.maxes_count ?? 0,
          member_count: row?.member_count ?? 0,
          currency: grid.currency,
          ...(grid.stepMinor === null ? {} : { step_minor: Number(grid.stepMinor) }),
        };
        throw new DomainError('K_ANON_UNAVAILABLE', { ...detail });
      }
      const wire: BudgetBandWire & { track_high_minor: number } = {
        trip_id: tripId,
        currency: row.currency,
        maxes_count: row.maxes_count,
        member_count: row.member_count,
        low_minor: num(row.band_low_minor),
        high_minor: num(row.band_high_minor),
        step_minor: num(row.step_minor),
        track_high_minor: num(row.track_high_minor),
        dots: row.bucketed_dots,
        under_all_ok: row.under_all_ok === true,
        infeasible: row.infeasible === true,
        computed_at: (row.computed_at ?? new Date(0)).toISOString(),
      };
      return wire;
    });
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });

  app.get('/v1/setup/:trip_id/own-fit', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const { trip_id: tripId } = tripParams.parse(c.req.param());
    const body = await withUser(
      deps.pool,
      session.uid,
      'unknown',
      async (tx): Promise<OwnFitWire> => {
        await requireSetupMember(tx, tripId, session.uid);
        const mine = await tx.query<{ amount_trip_minor: string; trip_currency: string }>(
          'SELECT amount_trip_minor, trip_currency FROM app.my_budget_max($1)',
          [tripId],
        );
        const plan = await tx.query<{ target_minor: string; currency: string }>(
          'SELECT target_minor, currency FROM budget_plans WHERE trip_id = $1 AND locked_at IS NOT NULL',
          [tripId],
        );
        const own = mine.rows[0];
        const target = plan.rows[0];
        const state =
          own !== undefined && target !== undefined && own.trip_currency !== target.currency
            ? 'no_target'
            : ownFit(
                own === undefined
                  ? null
                  : {
                      amountMinor: BigInt(own.amount_trip_minor),
                      currency: own.trip_currency,
                    },
                target === undefined
                  ? null
                  : {
                      amountMinor: BigInt(target.target_minor),
                      currency: target.currency,
                    },
              );
        return { trip_id: tripId, state };
      },
    );
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });

  app.get('/v1/me/private/:kind', async (c) => {
    const session = await requireCommandSession(deps.sessions, c.req.raw.headers);
    const kind = privateReadKindSchema.safeParse(c.req.param('kind'));
    if (!kind.success) throw new DomainError('NOT_FOUND', { reason: 'private_kind' });
    const query = privateQuery.parse(c.req.query());
    const body = await withUser(deps.pool, session.uid, 'unknown', async (tx) => {
      if (kind.data === 'budget_default') {
        const { rows } = await tx.query<{
          amount_minor: string;
          currency: string;
          updated_at: Date;
        }>(
          'SELECT amount_minor, currency, updated_at FROM budget_defaults_private WHERE user_id = $1',
          [session.uid],
        );
        const row = rows[0];
        if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'not_set' });
        return {
          amount_minor: Number(row.amount_minor),
          currency: row.currency,
          updated_at: row.updated_at.toISOString(),
        };
      }
      if (query.trip_id === undefined) throw new DomainError('VALIDATION', { reason: 'trip_id' });
      const { rows } = await tx.query<{
        amount_minor: string;
        currency: string;
        source: PrivateBudgetMaxWire['source'];
        updated_at: Date;
      }>('SELECT amount_minor, currency, source, updated_at FROM app.my_budget_max($1)', [
        query.trip_id,
      ]);
      const row = rows[0];
      if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'not_set' });
      const wire: PrivateBudgetMaxWire = {
        trip_id: query.trip_id,
        amount_minor: Number(row.amount_minor),
        currency: row.currency,
        source: row.source,
        updated_at: row.updated_at.toISOString(),
      };
      return wire;
    });
    c.header('Cache-Control', 'private, no-store');
    return c.json(body);
  });
}
