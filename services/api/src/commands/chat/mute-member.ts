/**
 * `mute_member` (docs/api-contracts.md §4.2, doc delta): hides one crewmate's messages on the
 * caller's own devices (`user_settings.muted_uids`). Nobody else learns about it, and it never
 * affects what the muted member can send or see.
 */
import { DomainError, muteMemberPayloadSchema, type MuteMemberResult } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { requireActiveMember } from '../crews/shared';

export const muteMemberCommand = defineCommand({
  name: 'mute_member',
  v: 1,
  schema: muteMemberPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireActiveMember(tx, payload.crew_id, ctx.uid);
    if (payload.uid === ctx.uid) throw new DomainError('VALIDATION', { reason: 'self_mute' });
    const { rows } = await tx.query(
      'SELECT 1 FROM crew_members WHERE crew_id = $1 AND user_id = $2',
      [payload.crew_id, payload.uid],
    );
    if (rows.length === 0) throw new DomainError('NOT_FOUND', { reason: 'member' });
  },
  handle: async (tx, payload, ctx): Promise<MuteMemberResult> => {
    await tx.query(
      `INSERT INTO user_settings (user_id, muted_uids)
       VALUES ($1, CASE WHEN $3 THEN ARRAY[$2::uuid] ELSE '{}'::uuid[] END)
       ON CONFLICT (user_id) DO UPDATE SET muted_uids = CASE
         WHEN $3 THEN (SELECT array_agg(DISTINCT u) FROM unnest(user_settings.muted_uids || $2::uuid) u)
         ELSE array_remove(user_settings.muted_uids, $2::uuid)
       END`,
      [ctx.uid, payload.uid, payload.muted],
    );
    return { uid: payload.uid, muted: payload.muted };
  },
});
