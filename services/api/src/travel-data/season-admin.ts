/**
 * `upsert_season_editorial` (docs/api-contracts.md §4.17, content role): writes one destination's
 * month curves and dated events and audits the call in `ops.admin_audit`, in one transaction.
 * Exported as a `{contract, policy, handle}` module like `upsert_poi`, for the admin registry to
 * mount; `tx` must come from `withSystem` (season tables grant writes to app_system only).
 *
 * Rows are drafts unless `approve` is set: an edit clears `reviewed_at`, so a changed curve is
 * hidden from the app until a reviewer approves it again. A blossom or foliage forecast edit stamps
 * `forecast_updated_at`.
 *
 * The season review queue is every unreviewed event (web research candidates and edited drafts),
 * listed with its source for a content reviewer; `review_season_event` approves one (served from
 * then on) or rejects it (removed), audited like the upsert.
 */
import {
  canReviewSeasonEvents,
  canUpsertSeasonEditorial,
  DomainError,
  reviewSeasonEventInputSchema,
  type ReviewSeasonEventInput,
  upsertSeasonEditorialInputSchema,
  type PolicyActor,
  type SeasonEditorial,
  type UpsertSeasonEditorialInput,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

export const upsertSeasonEditorialResultSchema = z.object({
  destination_id: z.uuid(),
  months: z.number().int(),
  events: z.number().int(),
  reviewed: z.boolean(),
});
export type UpsertSeasonEditorialResult = z.infer<typeof upsertSeasonEditorialResultSchema>;

export const upsertSeasonEditorialContract = {
  name: 'upsert_season_editorial' as const,
  input: upsertSeasonEditorialInputSchema,
  result: upsertSeasonEditorialResultSchema,
};

export const upsertSeasonEditorialPolicy = canUpsertSeasonEditorial;

/** Writes `editorial` for `destinationId`; shared by the admin command and the seed loader. */
export async function writeSeasonEditorial(
  tx: pg.PoolClient,
  destinationId: string,
  editorial: SeasonEditorial,
  reviewedAt: Date | null,
): Promise<void> {
  for (const month of editorial.months) {
    await tx.query(
      `INSERT INTO season_months (destination_id, month, crowd_index, price_index, highlight_tag,
         colour_role, source, source_url, sourced_on, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (destination_id, month) DO UPDATE SET
         crowd_index = EXCLUDED.crowd_index, price_index = EXCLUDED.price_index,
         price_index_source = 'editorial', highlight_tag = EXCLUDED.highlight_tag,
         colour_role = EXCLUDED.colour_role, source = EXCLUDED.source,
         source_url = EXCLUDED.source_url, sourced_on = EXCLUDED.sourced_on,
         reviewed_at = EXCLUDED.reviewed_at`,
      [
        destinationId,
        month.month,
        month.crowd_index,
        month.price_index,
        month.highlight_tag,
        month.colour_role,
        month.source,
        month.source_url,
        month.sourced_on,
        reviewedAt,
      ],
    );
  }
  for (const event of editorial.events) {
    await tx.query(
      `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, confidence,
         source, source_url, sourced_on, forecast_updated_at, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               CASE WHEN $7 = 'forecast' THEN now() END, $11)
       ON CONFLICT (destination_id, key) DO UPDATE SET
         kind = EXCLUDED.kind, name = EXCLUDED.name, starts_on = EXCLUDED.starts_on,
         ends_on = EXCLUDED.ends_on, confidence = EXCLUDED.confidence, source = EXCLUDED.source,
         source_url = EXCLUDED.source_url, sourced_on = EXCLUDED.sourced_on,
         forecast_updated_at = CASE
           WHEN EXCLUDED.confidence = 'forecast'
            AND (season_events.starts_on, season_events.ends_on, season_events.confidence)
                IS DISTINCT FROM (EXCLUDED.starts_on, EXCLUDED.ends_on, EXCLUDED.confidence)
           THEN now() ELSE season_events.forecast_updated_at END,
         reviewed_at = EXCLUDED.reviewed_at`,
      [
        destinationId,
        event.key,
        event.kind,
        event.name,
        event.starts_on,
        event.ends_on,
        event.confidence,
        event.source,
        event.source_url,
        event.sourced_on,
        reviewedAt,
      ],
    );
  }
}

export async function handleUpsertSeasonEditorial(
  tx: pg.PoolClient,
  actor: PolicyActor,
  rawInput: UpsertSeasonEditorialInput,
): Promise<UpsertSeasonEditorialResult> {
  const decision = canUpsertSeasonEditorial(actor);
  if (!decision.ok) throw new DomainError(decision.deny);
  const input = upsertSeasonEditorialInputSchema.parse(rawInput);
  const exists = await tx.query('SELECT 1 FROM destinations WHERE id = $1', [input.destination_id]);
  if (exists.rows.length === 0) throw new DomainError('NOT_FOUND');

  const reviewed = input.approve === true;
  await writeSeasonEditorial(tx, input.destination_id, input, reviewed ? new Date() : null);
  await tx.query(
    `INSERT INTO ops.admin_audit (admin_id, action, target_kind, target_id)
     VALUES ($1, 'upsert_season_editorial', 'destination', $2)`,
    [actor.uid, input.destination_id],
  );
  return {
    destination_id: input.destination_id,
    months: input.months.length,
    events: input.events.length,
    reviewed,
  };
}

export interface SeasonReviewQueueRow {
  readonly id: string;
  readonly destination_id: string;
  readonly key: string;
  readonly kind: string;
  readonly name: string;
  readonly starts_on: string;
  readonly ends_on: string;
  readonly confidence: string;
  readonly source: string;
  readonly source_url: string | null;
  readonly sourced_on: string;
}

/** The season review queue, soonest first; one destination's when `destinationId` is given. */
export async function listSeasonReviewQueue(
  tx: pg.PoolClient,
  actor: PolicyActor,
  destinationId?: string,
): Promise<SeasonReviewQueueRow[]> {
  const decision = canReviewSeasonEvents(actor);
  if (!decision.ok) throw new DomainError(decision.deny);
  const { rows } = await tx.query<SeasonReviewQueueRow>(
    `SELECT id, destination_id, key, kind, name, starts_on::text, ends_on::text, confidence, source,
            source_url, sourced_on::text
       FROM season_events
      WHERE reviewed_at IS NULL AND ($1::uuid IS NULL OR destination_id = $1)
      ORDER BY starts_on, key`,
    [destinationId ?? null],
  );
  return rows;
}

export const reviewSeasonEventResultSchema = z.object({
  event_id: z.uuid(),
  decision: z.enum(['approve', 'reject']),
});
export type ReviewSeasonEventResult = z.infer<typeof reviewSeasonEventResultSchema>;

export const reviewSeasonEventContract = {
  name: 'review_season_event' as const,
  input: reviewSeasonEventInputSchema,
  result: reviewSeasonEventResultSchema,
};

export const reviewSeasonEventPolicy = canReviewSeasonEvents;

/** Approves (sets `reviewed_at`) or rejects (deletes) one queued event; `tx` from `withSystem`. */
export async function handleReviewSeasonEvent(
  tx: pg.PoolClient,
  actor: PolicyActor,
  rawInput: ReviewSeasonEventInput,
): Promise<ReviewSeasonEventResult> {
  const decision = canReviewSeasonEvents(actor);
  if (!decision.ok) throw new DomainError(decision.deny);
  const input = reviewSeasonEventInputSchema.parse(rawInput);
  const { rows } = await tx.query<{ destination_id: string }>(
    input.decision === 'approve'
      ? `UPDATE season_events SET reviewed_at = now()
          WHERE id = $1 AND reviewed_at IS NULL RETURNING destination_id`
      : 'DELETE FROM season_events WHERE id = $1 AND reviewed_at IS NULL RETURNING destination_id',
    [input.event_id],
  );
  if (rows.length === 0) throw new DomainError('NOT_FOUND');
  await tx.query(
    `INSERT INTO ops.admin_audit (admin_id, action, target_kind, target_id)
     VALUES ($1, $2, 'season_event', $3)`,
    [actor.uid, `review_season_event.${input.decision}`, input.event_id],
  );
  return { event_id: input.event_id, decision: input.decision };
}
