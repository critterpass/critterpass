/**
 * `GET /v1/admin/counts`: one badge per area the caller's roles open (`{area: {count, tone}}`),
 * from each area's registered `count`, plus `work` (the caller's own claimed items). The console
 * polls it every 20 s for the nav badges, Home and the phone tabs.
 */
import { adminCountsSchema, canOpenAdminArea, type AdminCounts } from '@cp/domain';
import type pg from 'pg';

import { withAdminReader } from './reads';
import {
  defineAdminArea,
  defineAdminRead,
  type AdminAreaDefinition,
  type AdminRegistry,
} from './registry';
import { openItemsCount, visibleWork } from './work';

export function countsArea(pool: pg.Pool, registry: () => AdminRegistry): AdminAreaDefinition {
  return defineAdminArea({
    id: 'counts',
    reads: [
      defineAdminRead({
        path: '/counts',
        area: 'home',
        summary: 'Badge counts for the areas my roles open',
        response: adminCountsSchema,
        run: ({ admin }) =>
          withAdminReader(pool, admin.uid, async (tx) => {
            const now = new Date();
            const counts: AdminCounts = {};
            for (const count of registry().counts()) {
              if (canOpenAdminArea(admin.roles, count.area).ok) {
                counts[count.area] = await count.run(tx, now);
              }
            }
            const mine = (await visibleWork(tx, registry().workSources(), admin.roles)).filter(
              (item) => item.holder === admin.uid,
            );
            counts.work = openItemsCount(
              mine.map((item) => ({ due_at: item.due_at === null ? null : new Date(item.due_at) })),
              now,
            );
            return counts;
          }),
      }),
    ],
    commands: [],
  });
}
