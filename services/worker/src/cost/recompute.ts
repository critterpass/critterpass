/**
 * `cost.recompute` (docs/api-contracts-async.md §2.2): re-prices a trip whenever its quotes,
 * participants, rooms, plan version or FX run change, and persists the result as the single source
 * every surface reads — `cost_components`, each member's `share_calcs` row and the crew-visible
 * `trip_share_totals`. Idempotent on the input hash: a rerun with the same inputs writes nothing.
 * A recompute that changed anything tells the trip hub with a `tiles` hint.
 */
import { computeShares, type CostComponent, type ShareCalc } from '@cp/cost-engine';
import { outbox, withSystem } from '@cp/db';
import { channelName } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob } from '../boss/define-job';
import { loadCostInputs, type CostInputs } from './inputs';

export type RecomputeOutcome =
  | { readonly status: 'no_trip' }
  | { readonly status: 'unchanged'; readonly version: string }
  | { readonly status: 'written'; readonly version: string; readonly members: number };

async function storedVersions(tx: pg.PoolClient, tripId: string): Promise<string[]> {
  const { rows } = await tx.query<{ v: string }>(
    `SELECT calc_version AS v FROM cost_components WHERE trip_id = $1
     UNION SELECT calc_version FROM trip_share_totals WHERE trip_id = $1`,
    [tripId],
  );
  return rows.map((r) => r.v);
}

function isShared(component: CostComponent): boolean {
  return component.unit !== 'person';
}

async function writeComponents(tx: pg.PoolClient, inputs: CostInputs): Promise<void> {
  const keys = inputs.components.map((c) => c.id);
  await tx.query(
    'DELETE FROM cost_components WHERE trip_id = $1 AND NOT (component_key = ANY($2))',
    [inputs.tripId, keys],
  );
  for (const c of inputs.components) {
    await tx.query(
      `INSERT INTO cost_components (trip_id, calc_version, component_key, kind, unit, is_shared,
         origin, member_ids, amount_minor, currency, source, quote_id, label, seen_at, frozen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (trip_id, component_key) DO UPDATE SET
         calc_version = EXCLUDED.calc_version, kind = EXCLUDED.kind, unit = EXCLUDED.unit,
         is_shared = EXCLUDED.is_shared, origin = EXCLUDED.origin, member_ids = EXCLUDED.member_ids,
         amount_minor = EXCLUDED.amount_minor, currency = EXCLUDED.currency,
         source = EXCLUDED.source, quote_id = EXCLUDED.quote_id, label = EXCLUDED.label,
         seen_at = EXCLUDED.seen_at, frozen_at = EXCLUDED.frozen_at`,
      [
        inputs.tripId,
        inputs.version,
        c.id,
        c.kind,
        c.unit,
        isShared(c),
        c.origin ?? null,
        c.memberIds ?? null,
        c.amountMinor?.toString() ?? null,
        c.currency,
        c.source,
        c.quoteId ?? null,
        c.label ?? null,
        c.seenAt,
        c.frozenAt ?? null,
      ],
    );
  }
}

async function writeShares(
  tx: pg.PoolClient,
  inputs: CostInputs,
  calc: ShareCalc,
): Promise<number> {
  const members = calc.status === 'ok' ? calc.members : [];
  await tx.query('DELETE FROM share_calcs WHERE trip_id = $1 AND version <> $2', [
    inputs.tripId,
    inputs.version,
  ]);
  await tx.query('DELETE FROM trip_share_totals WHERE trip_id = $1 AND NOT (user_id = ANY($2))', [
    inputs.tripId,
    members.map((m) => m.uid),
  ]);
  for (const share of members) {
    const lines = share.lines.map((line) => ({
      component_key: line.componentId,
      kind: line.kind,
      amount_minor: line.amountMinor === null ? null : line.amountMinor.toString(),
    }));
    await tx.query(
      `INSERT INTO share_calcs (trip_id, user_id, version, components, total_minor, currency,
         fx_snapshot_id, is_missing, is_estimated_origin, is_stale)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (trip_id, user_id, version) DO NOTHING`,
      [
        inputs.tripId,
        share.uid,
        inputs.version,
        JSON.stringify(lines),
        share.totalMinor.toString(),
        share.currency,
        inputs.fxSnapshotId,
        share.missing,
        share.estimatedOrigin,
        share.stale,
      ],
    );
    await tx.query(
      `INSERT INTO trip_share_totals (trip_id, user_id, total_minor, currency, calc_version, is_missing)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (trip_id, user_id) DO UPDATE SET total_minor = EXCLUDED.total_minor,
         currency = EXCLUDED.currency, calc_version = EXCLUDED.calc_version,
         is_missing = EXCLUDED.is_missing`,
      [
        inputs.tripId,
        share.uid,
        share.totalMinor.toString(),
        share.currency,
        inputs.version,
        share.missing,
      ],
    );
  }
  return members.length;
}

export async function recomputeTripCosts(
  pool: pg.Pool,
  tripId: string,
  now: Date = new Date(),
): Promise<RecomputeOutcome> {
  return withSystem(pool, async (tx) => {
    // One recompute per trip at a time, even outside the keyed queue (e.g. an api-triggered run).
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`cost:${tripId}`]);
    const inputs = await loadCostInputs(tx, tripId);
    if (!inputs) return { status: 'no_trip' };
    const stored = await storedVersions(tx, tripId);
    const empty = inputs.components.length === 0 && inputs.members.length === 0;
    if ((stored.length === 1 && stored[0] === inputs.version) || (empty && stored.length === 0)) {
      return { status: 'unchanged', version: inputs.version };
    }
    const calc = computeShares({
      currency: inputs.currency,
      members: inputs.members,
      components: inputs.components,
      ...(inputs.fx ? { fx: inputs.fx } : {}),
      now,
    });
    await writeComponents(tx, inputs);
    const members = await writeShares(tx, inputs, calc);
    await outbox(tx, channelName('trip', tripId), 'tiles', {
      tile: 'costs',
      version: inputs.version,
    });
    return { status: 'written', version: inputs.version, members };
  });
}

export const costRecomputeJob = defineJob({
  queue: 'cost.recompute',
  schema: z.object({ trip_id: z.uuid() }),
  singletonKey: (data) => data.trip_id,
  async handler(data, { pool, logger }) {
    const outcome = await recomputeTripCosts(pool, data.trip_id);
    logger.info({ tripId: data.trip_id, ...outcome }, 'trip costs recomputed');
    return { ...outcome };
  },
});
