/**
 * Crew plans in the console (docs/api-contracts.md §4.17): the plans crews have published, or that
 * came down, with their counts and open reports, and `admin_unpublish_shared_plan`, which takes one
 * down with the operator's reason. Reports themselves are worked in the moderation queue
 * (./moderation.ts); this is the list an operator scans and the direct way to act on one.
 *
 * The read runs as admin_reader and lists what any traveller browsing crew plans sees: the title,
 * the place and the counts. The plan's days and places are not read here.
 */
import {
  adminSharedPlansQuerySchema,
  adminSharedPlansResponseSchema,
  adminUnpublishSharedPlanPayloadSchema,
  DomainError,
} from '@cp/domain';
import type pg from 'pg';

import { sharedPlanById, unpublish } from '../../commands/community/store';
import { withAdminReader } from '../reads';
import { defineAdminArea, defineAdminCommand, defineAdminRead } from '../registry';
import { SHARED_PLAN_MODERATION_KIND } from './moderation';

interface PlanRow {
  id: string;
  status: 'published' | 'unpublished';
  title: string | null;
  destination_name: string | null;
  days_count: number;
  crew_size: number;
  rating_avg: string | null;
  rating_count: number;
  copies_count: number;
  saves_count: number;
  open_reports: number;
  published_at: Date | null;
  unpublished_at: Date | null;
  unpublish_reason: string | null;
}

const LIST_LIMIT = 100;
const iso = (value: Date | null) => value?.toISOString() ?? null;

/** Takes a published plan down with the operator's reason; the crew is told in their chat. */
export async function adminUnpublishSharedPlan(
  tx: pg.PoolClient,
  id: string,
  reason: string,
  adminUid: string,
): Promise<{ unpublished: true }> {
  const plan = await sharedPlanById(tx, id, { lock: true });
  if (plan.status !== 'published') {
    throw new DomainError('STATE_INVALID', { reason: 'not_published' });
  }
  await unpublish(tx, plan, 'ops', { kind: 'system', id: null }, reason);
  // Nothing is left to judge: its open reports close with the plan.
  await tx.query(
    `UPDATE moderation_reports SET status = 'actioned', verdict = 'hide', decided_at = now(), decided_by = $3
      WHERE target_kind = $1 AND target_id = $2 AND status = 'open'`,
    [SHARED_PLAN_MODERATION_KIND, id, adminUid],
  );
  return { unpublished: true };
}

export function communityArea(pool: pg.Pool) {
  return defineAdminArea({
    id: 'community',
    reads: [
      defineAdminRead({
        path: '/shared-plans',
        area: 'community',
        summary: 'Crew plans that are published, or that came down: most reported, then newest',
        query: adminSharedPlansQuerySchema,
        response: adminSharedPlansResponseSchema,
        run: ({ admin, query }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const { rows } = await tx.query<PlanRow>(
              `SELECT p.id, p.status, p.title, p.projection ->> 'destination_name' AS destination_name,
                      p.days_count, p.crew_size, p.rating_avg, p.rating_count, p.copies_count,
                      p.saves_count, p.published_at, p.unpublished_at, p.unpublish_reason,
                      (SELECT coalesce(sum(r.report_count), 0)::int FROM moderation_reports r
                        WHERE r.target_kind = $2 AND r.target_id = p.id AND r.status = 'open')
                        AS open_reports
                 FROM shared_plans p
                WHERE p.status = $1
                ORDER BY open_reports DESC, coalesce(p.unpublished_at, p.published_at) DESC NULLS LAST
                LIMIT ${LIST_LIMIT}`,
              [query.status, SHARED_PLAN_MODERATION_KIND],
            );
            return adminSharedPlansResponseSchema.parse({
              items: rows.map((row) => ({
                ...row,
                rating_avg: row.rating_avg === null ? null : Number(row.rating_avg),
                published_at: iso(row.published_at),
                unpublished_at: iso(row.unpublished_at),
              })),
            });
          }),
      }),
    ],
    commands: [
      defineAdminCommand({
        name: 'admin_unpublish_shared_plan',
        schema: adminUnpublishSharedPlanPayloadSchema,
        audit: (payload) => ({
          targetKind: 'shared_plan',
          targetId: payload.id,
          reason: payload.reason,
        }),
        handle: (tx, payload, ctx) =>
          adminUnpublishSharedPlan(tx, payload.id, payload.reason, ctx.admin.uid),
      }),
    ],
  });
}
