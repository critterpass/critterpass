/**
 * `remove_member` (docs/api-contracts.md §4.2): a crew organiser, the crew's creator or an
 * organiser of one of its live trips removes another active member. Nobody removes the creator,
 * and only the creator removes a crew organiser (co-organisers cannot remove the organiser). The
 * removed member loses realtime and sync access in the same transaction.
 */
import { DomainError, removeMemberPayloadSchema, type MembershipChangeResult } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { departCrew } from './membership';
import { requireActiveMember } from './shared';

export const removeMemberCommand = defineCommand({
  name: 'remove_member',
  v: 1,
  schema: removeMemberPayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: async (tx, payload, ctx) => {
    await requireActiveMember(tx, payload.crew_id, ctx.uid);
    if (payload.uid === ctx.uid) {
      throw new DomainError('VALIDATION', { reason: 'use_leave_crew' });
    }
    const { rows } = await tx.query<{
      can_manage: boolean;
      created_by: string | null;
      target_role: 'organiser' | 'member' | null;
    }>(
      `SELECT app.can_manage_crew_members($1) AS can_manage,
              (SELECT created_by FROM crews WHERE id = $1) AS created_by,
              (SELECT role FROM crew_members
                WHERE crew_id = $1 AND user_id = $2 AND status = 'active') AS target_role`,
      [payload.crew_id, payload.uid],
    );
    const row = rows[0];
    if (row?.can_manage !== true) throw new DomainError('FORBIDDEN', { reason: 'not_organiser' });
    if (row.target_role === null) throw new DomainError('NOT_FOUND', { reason: 'member' });
    if (payload.uid === row.created_by) {
      throw new DomainError('FORBIDDEN', { reason: 'creator_cannot_be_removed' });
    }
    if (row.target_role === 'organiser' && ctx.uid !== row.created_by) {
      throw new DomainError('FORBIDDEN', { reason: 'organiser_removed_by_creator_only' });
    }
  },
  handle: (tx, payload, ctx): Promise<MembershipChangeResult> =>
    departCrew(tx, {
      crewId: payload.crew_id,
      memberId: payload.uid,
      actorId: ctx.uid,
      status: 'removed',
      keepInChat: false,
    }),
});
