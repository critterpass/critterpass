/**
 * `submit_private_reason` (docs/api-contracts.md §4.7): a recipient tells the guide, and only
 * the guide, what holds them back. The reason lands in their own private thread (sealed free text,
 * never replicated), their public status becomes MAYBE if they had not answered, and the options
 * come from code. No domain event, no crew-visible row and no realtime message names them; the
 * SSE route (`POST /v1/proposals/{id}/private/reason`) words the options after this commits.
 */
import { crypto as dbCrypto } from '@cp/db';
import { submitPrivateReasonPayloadSchema } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import type { FieldKeyring } from '../bookings/deps';
import { defineCommand } from '../_framework/define-command';
import { objectionOptions, type ObjectionOption } from './objection-options';
import { replyWithSeat } from './rsvp';
import { requireRecipient, returned } from './shared';

export interface PrivateReasonResult {
  readonly thread_id: string;
  readonly reason: string;
  readonly options: readonly ObjectionOption[];
}

const UNANSWERED = new Set(['unopened', 'opened']);

export function createSubmitPrivateReasonCommand(deps: { readonly keyring?: FieldKeyring }) {
  return defineCommand({
    name: 'submit_private_reason',
    v: 1,
    schema: submitPrivateReasonPayloadSchema,
    offline: false,
    allowAnonymous: true,
    authorize: async (tx, payload, ctx) => {
      await requireRecipient(tx, payload.proposal_id, ctx.uid);
    },
    handle: async (tx, payload, ctx): Promise<PrivateReasonResult> => {
      const proposal = await requireRecipient(tx, payload.proposal_id, ctx.uid);
      const { rows } = await tx.query<{ rsvp: string }>(
        'SELECT rsvp FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
        [proposal.trip_id, ctx.uid],
      );
      const rsvp = rows[0]?.rsvp;
      if (rsvp === undefined || UNANSWERED.has(rsvp)) {
        await replyWithSeat(
          tx,
          {
            tripId: proposal.trip_id,
            crewId: proposal.crew_id,
            uid: ctx.uid,
            proposalId: proposal.id,
          },
          'maybe',
        );
      }
      // Free text is sealed; without the keyring it is not kept at all, never kept in the clear.
      const body =
        payload.text === undefined || deps.keyring === undefined
          ? null
          : dbCrypto.encryptField(payload.text, deps.keyring);
      return asSystemRole(tx, async () => {
        const options = await objectionOptions(tx, proposal.trip_id, ctx.uid, payload.reason);
        const thread = await tx.query<{ id: string }>(
          `INSERT INTO private_guide_threads (id, trip_id, proposal_id, owner_id, reason, body_enc,
                                              offered_options)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [
            ctx.opId,
            proposal.trip_id,
            proposal.id,
            ctx.uid,
            payload.reason,
            body,
            JSON.stringify(options),
          ],
        );
        return { thread_id: returned(thread.rows).id, reason: payload.reason, options };
      });
    },
  });
}
