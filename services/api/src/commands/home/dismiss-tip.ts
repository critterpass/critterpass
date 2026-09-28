/**
 * `dismiss_tip` (docs/api-contracts.md §4.3): a crew member swipes the Home tip away. The tip is
 * the crew's, so it leaves every member's Home on every device (the `crews` stream carries active
 * tips only). Dismissing a tip that is already gone answers with its current state.
 */
import { appendDomainEvent } from '@cp/db';
import { DomainError } from '@cp/domain';
import { z } from 'zod';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export const dismissTipPayloadSchema = z.object({ tip_id: z.uuid() });

export interface DismissTipResult {
  readonly tip_id: string;
  readonly status: 'dismissed' | 'expired';
}

export const dismissTipCommand = defineCommand({
  name: 'dismiss_tip',
  v: 1,
  schema: dismissTipPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    // RLS shows a tip only to active members of its crew.
    const { rows } = await tx.query('SELECT 1 FROM home_tips WHERE id = $1', [payload.tip_id]);
    if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'tip' });
  },
  handle: async (tx, payload, ctx): Promise<DismissTipResult> => {
    const now = ctx.clock.serverNow;
    return asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ crew_id: string; status: 'dismissed' | 'expired' }>(
        `UPDATE home_tips SET status = 'dismissed', dismissed_by = $2, dismissed_at = $3
          WHERE id = $1 AND status = 'active'
          RETURNING crew_id, status`,
        [payload.tip_id, ctx.uid, now],
      );
      const dismissed = rows[0];
      if (dismissed === undefined) {
        const current = await tx.query<{ status: 'dismissed' | 'expired' }>(
          'SELECT status FROM home_tips WHERE id = $1',
          [payload.tip_id],
        );
        return { tip_id: payload.tip_id, status: current.rows[0]?.status ?? 'expired' };
      }
      await appendDomainEvent(tx, {
        type: 'tip.dismissed',
        aggregateKind: 'home_tip',
        aggregateId: payload.tip_id,
        actorKind: 'user',
        actorId: ctx.uid,
        payload: { tip_id: payload.tip_id, crew_id: dismissed.crew_id, user_id: ctx.uid },
        crewId: dismissed.crew_id,
      });
      return { tip_id: payload.tip_id, status: 'dismissed' };
    });
  },
});
