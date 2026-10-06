/**
 * Community subjects in the ops moderation queue (docs/api-contracts.md §4.17):
 *
 * - `shared_plan`: a published crew plan any traveller can report (`report_content`). Hiding it
 *   unpublishes the plan with the ops reason; the crew sees it come down in their chat.
 * - `rating_tip`: a tip for the next crew that the compliance check held for review. Approving it
 *   publishes it anonymously on the place; hiding or removing turns it down.
 */
import { DomainError } from '@cp/domain';
import type pg from 'pg';

import { sharedPlanById, unpublish } from '../../commands/community/store';
import { registerModerationKind } from '../moderation-intake';

export const SHARED_PLAN_MODERATION_KIND = 'shared_plan';
export const RATING_TIP_MODERATION_KIND = 'rating_tip';

/** Publishes a held tip on its place as an anonymous community tip (idempotent). */
export async function publishRatingTip(tx: pg.PoolClient, ratingId: string): Promise<void> {
  const { rows } = await tx.query<{
    poi_id: string;
    tip: string | null;
    place_tip_id: string | null;
  }>('SELECT poi_id, tip, place_tip_id FROM ratings WHERE id = $1 FOR UPDATE', [ratingId]);
  const rating = rows[0];
  if (rating?.tip == null) return;
  if (rating.place_tip_id !== null) {
    await tx.query("UPDATE place_tips SET moderation_status = 'approved' WHERE id = $1", [
      rating.place_tip_id,
    ]);
  } else {
    const { rows: inserted } = await tx.query<{ id: string }>(
      `INSERT INTO place_tips (poi_id, text, source, moderation_status)
       VALUES ($1, $2, 'community', 'approved') RETURNING id`,
      [rating.poi_id, rating.tip],
    );
    await tx.query('UPDATE ratings SET place_tip_id = $2 WHERE id = $1', [
      ratingId,
      inserted[0]!.id,
    ]);
  }
  await tx.query("UPDATE ratings SET tip_status = 'approved' WHERE id = $1", [ratingId]);
}

let registered = false;

export function registerCommunityModerationKinds(): void {
  if (registered) return;
  registered = true;
  registerModerationKind({
    kind: SHARED_PLAN_MODERATION_KIND,
    verdicts: ['approve', 'hide'],
    exists: async (tx, id) =>
      (await tx.query("SELECT 1 FROM shared_plans WHERE id = $1 AND status = 'published'", [id]))
        .rowCount === 1,
    preview: async (tx, id) => {
      const { rows } = await tx.query<{
        title: string | null;
        projection: { destination_name?: string; days_count?: number };
      }>('SELECT title, projection FROM shared_plans WHERE id = $1', [id]);
      const plan = rows[0];
      if (plan === undefined) return { type: 'missing', title: 'Crew plan' };
      const place = plan.projection.destination_name ?? 'a destination';
      return {
        type: 'text',
        title: `Crew plan: ${plan.title ?? place}`,
        text: `${plan.projection.days_count ?? 0} days in ${place} · plan ${id}. Hide unpublishes it for every crew.`,
      };
    },
    author: async (tx, id) => {
      const { rows } = await tx.query<{ requested_by: string | null }>(
        'SELECT requested_by FROM shared_plans WHERE id = $1',
        [id],
      );
      return rows[0]?.requested_by ?? null;
    },
    apply: async (tx, id) => {
      const plan = await sharedPlanById(tx, id, { lock: true });
      if (plan.status !== 'published') return;
      await unpublish(tx, plan, 'ops', { kind: 'system', id: null }, 'hidden_by_ops');
    },
  });
  registerModerationKind({
    kind: RATING_TIP_MODERATION_KIND,
    verdicts: ['approve', 'hide', 'remove'],
    exists: async (tx, id) =>
      (await tx.query('SELECT 1 FROM ratings WHERE id = $1 AND tip IS NOT NULL', [id])).rowCount ===
      1,
    preview: async (tx, id) => {
      const { rows } = await tx.query<{ tip: string | null; name: string }>(
        'SELECT r.tip, p.name FROM ratings r JOIN pois p ON p.id = r.poi_id WHERE r.id = $1',
        [id],
      );
      const tip = rows[0];
      if (tip?.tip == null) return { type: 'missing', title: 'Tip for the next crew' };
      return { type: 'text', title: `Tip on ${tip.name}`, text: tip.tip };
    },
    author: async (tx, id) => {
      const { rows } = await tx.query<{ user_id: string }>(
        'SELECT user_id FROM ratings WHERE id = $1',
        [id],
      );
      return rows[0]?.user_id ?? null;
    },
    approve: async (tx, id) => {
      await publishRatingTip(tx, id);
    },
    apply: async (tx, id) => {
      const { rows } = await tx.query<{ place_tip_id: string | null }>(
        "UPDATE ratings SET tip_status = 'rejected' WHERE id = $1 AND tip IS NOT NULL RETURNING place_tip_id",
        [id],
      );
      if (rows[0] === undefined) throw new DomainError('NOT_FOUND');
      if (rows[0].place_tip_id !== null) {
        await tx.query("UPDATE place_tips SET moderation_status = 'rejected' WHERE id = $1", [
          rows[0].place_tip_id,
        ]);
      }
    },
  });
}
