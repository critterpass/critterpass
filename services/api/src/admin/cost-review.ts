/**
 * Cost index review area (content role): each destination's editorial price bands, read as
 * `admin_reader`, and `review_cost_index`, the only write path that serves one. Approving sets
 * `reviewed_at` (with edited amounts saved in the same statement when given); the pipeline writes
 * the audit row with the amounts before and after.
 */
import {
  costReviewIndicesSchema,
  costReviewQuerySchema,
  costReviewSummarySchema,
  DomainError,
  isEstimatedCostIndex,
  reviewCostIndexInputSchema,
  type CostIndexAmounts,
  type CostReviewIndex,
  type ReviewCostIndexInput,
  type ReviewCostIndexResult,
} from '@cp/domain';
import type pg from 'pg';

import { withAdminReader } from './reads';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from './registry';

type IndexRow = Omit<CostReviewIndex, 'estimated' | 'reviewed_at'> & { reviewed_at: Date | null };

const AMOUNT_COLUMNS = `nightly_minor_low::float8 AS nightly_minor_low,
  nightly_minor_high::float8 AS nightly_minor_high, food_pp_day_minor::float8 AS food_pp_day_minor,
  fun_pp_day_minor::float8 AS fun_pp_day_minor`;

interface ReviewOutcome extends ReviewCostIndexResult {
  readonly before: CostIndexAmounts;
}

async function reviewCostIndex(
  tx: pg.PoolClient,
  input: ReviewCostIndexInput,
): Promise<ReviewOutcome> {
  const current = await tx.query<CostIndexAmounts & { destination_id: string }>(
    `SELECT destination_id, ${AMOUNT_COLUMNS} FROM destination_cost_indices WHERE id = $1
     FOR UPDATE`,
    [input.index_id],
  );
  const row = current.rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND');
  const { destination_id, ...before } = row;
  const after = input.amounts ?? before;
  const { rows } = await tx.query<{ reviewed_at: Date }>(
    `UPDATE destination_cost_indices
        SET nightly_minor_low = $2, nightly_minor_high = $3, food_pp_day_minor = $4,
            fun_pp_day_minor = $5, reviewed_at = now()
      WHERE id = $1 RETURNING reviewed_at`,
    [
      input.index_id,
      after.nightly_minor_low,
      after.nightly_minor_high,
      after.food_pp_day_minor,
      after.fun_pp_day_minor,
    ],
  );
  return {
    index_id: input.index_id,
    destination_id,
    edited: input.amounts !== undefined,
    reviewed_at: (rows[0]?.reviewed_at ?? new Date()).toISOString(),
    before,
  };
}

export function costReviewArea(pool: pg.Pool) {
  return defineAdminArea({
    id: 'costs',
    reads: [
      defineAdminRead({
        path: '/costs/summary',
        area: 'catalogue',
        summary: 'Cost indices waiting for review, in total and per destination',
        response: costReviewSummarySchema,
        run: ({ admin }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const { rows } = await tx.query<{ id: string; name: string; pending: number }>(
              `SELECT d.id, d.name, count(*) FILTER (WHERE i.reviewed_at IS NULL)::int AS pending
                 FROM destination_cost_indices i JOIN destinations d ON d.id = i.destination_id
                GROUP BY d.id, d.name
                ORDER BY d.name`,
            );
            return {
              pending: rows.reduce((sum, row) => sum + row.pending, 0),
              destinations: rows,
            };
          }),
      }),
      defineAdminRead({
        path: '/costs/indices',
        area: 'catalogue',
        summary: 'Cost indices per destination and stay type, drafts (pending) or approved',
        query: costReviewQuerySchema,
        response: costReviewIndicesSchema,
        run: ({ admin, query }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const { rows } = await tx.query<IndexRow>(
              `SELECT i.id, i.destination_id, d.name AS destination_name, i.stay_type,
                      ${AMOUNT_COLUMNS}, i.currency, i.source, i.source_url,
                      i.sourced_on::text, i.reviewed_at
                 FROM destination_cost_indices i JOIN destinations d ON d.id = i.destination_id
                WHERE ($1::uuid IS NULL OR i.destination_id = $1)
                  AND (i.reviewed_at IS NULL) = ($2 = 'pending')
                ORDER BY d.name, i.destination_id, i.nightly_minor_high DESC, i.stay_type`,
              [query.destination_id ?? null, query.state],
            );
            return {
              items: rows.map((row) => ({
                ...row,
                estimated: isEstimatedCostIndex(row),
                reviewed_at: row.reviewed_at?.toISOString() ?? null,
              })),
            };
          }),
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'review_cost_index',
        schema: reviewCostIndexInputSchema,
        audit: (payload: ReviewCostIndexInput, result: ReviewOutcome) => ({
          targetKind: 'destination_cost_index',
          targetId: result.index_id,
          detail: {
            destination_id: result.destination_id,
            edited: result.edited,
            before: result.before,
            ...(payload.amounts !== undefined ? { after: payload.amounts } : {}),
          },
        }),
        handle: (tx, payload) => reviewCostIndex(tx, payload),
      }),
    ],
  });
}
