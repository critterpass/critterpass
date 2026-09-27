/**
 * `upsert_season_editorial` (docs/api-contracts.md §4.17, content role): writes one destination's
 * month curves and dated events and audits the call in `ops.admin_audit`, in one transaction.
 * Exported as a `{contract, policy, handle}` module like `upsert_poi`, for the admin registry to
 * mount; `tx` must come from `withSystem` (season tables grant writes to app_system only).
 *
 * Rows are drafts unless `approve` is set: an edit clears `reviewed_at`, so a changed curve is
 * hidden from the app until a reviewer approves it again. A blossom or foliage forecast edit stamps
 * `forecast_updated_at`.
 */
import {
  canUpsertSeasonEditorial,
  DomainError,
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
