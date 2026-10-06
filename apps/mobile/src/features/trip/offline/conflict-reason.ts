/**
 * Why a change made with no signal didn't go through, in words. The server answers with a wire
 * code; the traveller never reads one. A code with no line of its own gets the general reason.
 */
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

const REASONS: Readonly<Record<string, MessageDescriptor>> = {
  NOT_FOUND: msg({
    id: 'trip.offline.reason.removed',
    message: 'It was removed while you were offline',
  }),
  VERSION_CONFLICT: msg({
    id: 'trip.offline.reason.changed',
    message: 'Someone changed it first',
  }),
  PLAN_VERSION_CONFLICT: msg({
    id: 'trip.offline.reason.planChanged',
    message: 'The plan changed while you were offline',
  }),
  FORBIDDEN: msg({
    id: 'trip.offline.reason.notAllowed',
    message: 'You can no longer change this',
  }),
  VOTE_CLOSED: msg({
    id: 'trip.offline.reason.voteClosed',
    message: 'The vote closed while you were offline',
  }),
};

const OTHER = msg({
  id: 'trip.offline.reason.other',
  message: "It couldn't be saved. Try it again",
});

export function conflictReason(code: string): MessageDescriptor {
  return Object.hasOwn(REASONS, code) ? (REASONS[code] ?? OTHER) : OTHER;
}
