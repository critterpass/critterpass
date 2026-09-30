/**
 * `record_sponsored_event` (docs/api-contracts-explore.md): a sponsored card was shown or tapped.
 * Analytics only: one daily count per placement, list and kind, with no user, device or trip
 * attached, so nothing about who saw it is kept (no personal targeting, nothing to track). The
 * op id makes a replay count once; an inactive placement is not found.
 */
import { DomainError, recordSponsoredEventPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';

export const recordSponsoredEventCommand = defineCommand({
  name: 'record_sponsored_event',
  v: 1,
  schema: recordSponsoredEventPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const { rows } = await tx.query('SELECT 1 FROM sponsored_placements WHERE id = $1', [
      payload.placement_id,
    ]);
    if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'placement' });
  },
  handle: async (tx, payload): Promise<{ recorded: true }> => {
    await asSystemRole(tx, () =>
      tx.query(
        `INSERT INTO sponsored_event_counts (placement_id, day, list_kind, kind, count)
         VALUES ($1, (now() AT TIME ZONE 'UTC')::date, $2, $3, 1)
         ON CONFLICT (placement_id, day, list_kind, kind)
           DO UPDATE SET count = sponsored_event_counts.count + 1`,
        [payload.placement_id, payload.list_kind, payload.kind],
      ),
    );
    return { recorded: true };
  },
});
