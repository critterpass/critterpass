/**
 * `request_fresh_invite` (docs/api-contracts.md §4.2): someone holding a crew or trip code that ran
 * out, was replaced or was used up asks for a new one. The person who shared it hears it (the crew's
 * organiser when they have left), with the way to send a fresh invite. Once a day per code and
 * person; a code that still works, an unknown one or a crew the caller is already in is refused.
 */
import { appendDomainEvent } from '@cp/db';
import {
  DomainError,
  normalizeJoinCode,
  requestFreshInvitePayloadSchema,
  type RequestFreshInviteResult,
} from '@cp/domain';

import { defineCommand } from '../_framework/define-command';

interface LapsedRow {
  readonly join_code_id: string;
  readonly crew_id: string;
  readonly trip_id: string | null;
  readonly ask_user: string | null;
  readonly asked_recently: boolean;
}

export const requestFreshInviteCommand = defineCommand({
  name: 'request_fresh_invite',
  v: 1,
  schema: requestFreshInvitePayloadSchema,
  offline: false,
  allowAnonymous: true,
  authorize: () => Promise.resolve(),
  handle: async (tx, payload, ctx): Promise<RequestFreshInviteResult> => {
    const code = normalizeJoinCode(payload.code);
    if (code === null) throw new DomainError('CODE_INVALID', { reason: 'unknown' });
    const { rows } = await tx.query<LapsedRow>('SELECT * FROM app.lapsed_join_code($1)', [code]);
    const lapsed = rows[0];
    if (lapsed === undefined) throw new DomainError('CODE_INVALID', { reason: 'not_lapsed' });
    if (lapsed.ask_user === null) throw new DomainError('NOT_FOUND', { reason: 'nobody_to_ask' });
    const member = await tx.query(
      `SELECT 1 FROM crew_members WHERE crew_id = $1 AND user_id = $2 AND status = 'active'`,
      [lapsed.crew_id, ctx.uid],
    );
    if ((member.rowCount ?? 0) > 0) {
      throw new DomainError('STATE_INVALID', { reason: 'already_member' });
    }
    if (lapsed.asked_recently) return { sent: false };
    await appendDomainEvent(tx, {
      type: 'invite.refresh_requested',
      aggregateKind: 'join_code',
      aggregateId: lapsed.join_code_id,
      actorKind: 'user',
      actorId: ctx.uid,
      payload: {
        join_code_id: lapsed.join_code_id,
        crew_id: lapsed.crew_id,
        trip_id: lapsed.trip_id,
        ask_user_id: lapsed.ask_user,
      },
      crewId: lapsed.crew_id,
    });
    return { sent: true };
  },
});
