/**
 * `add_poll_candidate` (docs/api-contracts.md §4.4): ADD TO THE VOTE from a guide pitch, or PITCH
 * TO THE CREW from a place page. The place lands on the crew's open board, starts a new vote when
 * there is none (the voting trip and its destination poll in this transaction), or is queued while
 * a final is on; a place already on the board answers with its option.
 */
import { addPollCandidatePayloadSchema, DomainError, type PitchToCrewResult } from '@cp/domain';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { pitchToCrew, resolvePlace } from './destination';
import { requireCrewMember, visiblePoll } from './shared';

export const addPollCandidateCommand = defineCommand({
  name: 'add_poll_candidate',
  v: 1,
  schema: addPollCandidatePayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireCrewMember(tx, payload.crew_id);
    if (payload.poll_id !== undefined) {
      const state = await visiblePoll(tx, payload.poll_id);
      if (state.poll.crew_id !== payload.crew_id || state.poll.kind !== 'destination') {
        throw new DomainError('NOT_FOUND', { reason: 'poll' });
      }
    }
  },
  handle: async (tx, payload, ctx): Promise<PitchToCrewResult> => {
    const place = await resolvePlace(tx, payload.place_id);
    return asSystemRole(tx, () =>
      pitchToCrew(tx, {
        crewId: payload.crew_id,
        place,
        pitchId: payload.pitch_id,
        month: payload.month,
        newTripId: payload.trip_id,
        uid: ctx.uid,
        now: ctx.clock.serverNow,
      }),
    );
  },
});
