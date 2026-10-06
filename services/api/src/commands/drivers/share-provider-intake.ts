/**
 * `share_provider_intake {intake_id, trip_id, kind, text}` (offline): a member shares a driver's
 * message, a screenshot's text or a contact card to the trip's SHARED WITH TOKEK list. It is the
 * crew's own trip data, read through the api only; the raw text is purged 30 days after it is
 * read. The id is the app's, so a replay answers the same item.
 */
import { DomainError, shareProviderIntakePayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { requireMember } from './shared';

export const shareProviderIntakeCommand = defineCommand({
  name: 'share_provider_intake',
  v: 1,
  schema: shareProviderIntakePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireMember(tx, payload.trip_id);
  },
  handle: async (tx, payload, ctx) => {
    const { rows } = await asSystemRole(tx, () =>
      tx.query<{ trip_id: string; shared_by: string }>(
        `INSERT INTO provider_intake (id, trip_id, shared_by, kind, raw_text)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET id = provider_intake.id
         RETURNING trip_id, shared_by`,
        [payload.intake_id, payload.trip_id, ctx.uid, payload.kind, payload.text],
      ),
    );
    const row = rows[0];
    if (row?.trip_id !== payload.trip_id || row.shared_by !== ctx.uid) {
      throw new DomainError('VALIDATION', { reason: 'intake_id' });
    }
    return { intake_id: payload.intake_id };
  },
});
