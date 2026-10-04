/**
 * `hide_place` / `unhide_place` (docs/api-contracts-planning.md): a place the caller swiped away
 * leaves their own map, list and suggestions. Hides are private to their owner: no event, no
 * hint to anyone else, and the crew's Ideas are untouched.
 */
import {
  DomainError,
  hidePlacePayloadSchema,
  unhidePlacePayloadSchema,
  type HidePlaceResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

async function requirePoi(tx: pg.PoolClient, poiId: string): Promise<void> {
  const { rowCount } = await tx.query('SELECT 1 FROM pois WHERE id = $1', [poiId]);
  if ((rowCount ?? 0) === 0) throw new DomainError('NOT_FOUND', { reason: 'place' });
}

export const hidePlaceCommand = defineCommand({
  name: 'hide_place',
  v: 1,
  schema: hidePlacePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload) => requirePoi(tx, payload.poi_id),
  handle: async (tx, payload, ctx): Promise<HidePlaceResult> => {
    await asSystemRole(tx, () =>
      tx.query(
        `INSERT INTO place_hides (user_id, poi_id) VALUES ($1, $2)
         ON CONFLICT (user_id, poi_id) DO NOTHING`,
        [ctx.uid, payload.poi_id],
      ),
    );
    return { poi_id: payload.poi_id, hidden: true };
  },
});

export const unhidePlaceCommand = defineCommand({
  name: 'unhide_place',
  v: 1,
  schema: unhidePlacePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<HidePlaceResult> => {
    await asSystemRole(tx, () =>
      tx.query('DELETE FROM place_hides WHERE user_id = $1 AND poi_id = $2', [
        ctx.uid,
        payload.poi_id,
      ]),
    );
    return { poi_id: payload.poi_id, hidden: false };
  },
});
