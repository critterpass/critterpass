/**
 * The proposal's inbox kinds. A proposal sent to a member needs them until they answer (in, maybe
 * or out, from any surface). Each answer is filed for the trip's organisers and stays on top until
 * a newer answer replaces it or the trip is locked in, so "who's in" is one card, never a pile.
 * The lock itself is a quiet entry for everyone holding a place. Rows carry ids and short values;
 * the app words them.
 */
import { registerInboxKind, type InboxKindSpec } from '../inbox/registry';

export const PROPOSAL_INBOX_KIND = {
  received: 'proposal.received',
  answered: 'proposal.answered',
  tripLocked: 'trip.locked',
} as const;

/** The answers that settle a waiting proposal; opening one is not an answer. */
export const PROPOSAL_ANSWERS: readonly string[] = ['in', 'maybe', 'out', 'waitlisted'];

export function proposalAnswerResolveKey(tripId: string, uid: string): string {
  return `proposal_answer:${tripId}:${uid}`;
}

export function proposalRepliesResolveKey(tripId: string): string {
  return `proposal_replies:${tripId}`;
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** A member's answer settles their own waiting proposal and the organisers' last reply card. */
function answerKeys(payload: Readonly<Record<string, unknown>>): readonly string[] {
  const tripId = text(payload['trip_id']);
  const uid = text(payload['user_id']);
  const rsvp = text(payload['rsvp']);
  if (tripId === null || uid === null || rsvp === null || !PROPOSAL_ANSWERS.includes(rsvp)) {
    return [];
  }
  return [proposalAnswerResolveKey(tripId, uid), proposalRepliesResolveKey(tripId)];
}

function lockKeys(payload: Readonly<Record<string, unknown>>): readonly string[] {
  const tripId = text(payload['trip_id']);
  return tripId === null || payload['to'] !== 'confirmed'
    ? []
    : [proposalRepliesResolveKey(tripId)];
}

export const PROPOSAL_INBOX_KINDS: readonly InboxKindSpec[] = [
  {
    kind: PROPOSAL_INBOX_KIND.received,
    event: 'proposal.sent',
    source: 'crew',
    needsYou: true,
    resolvedBy: [{ event: 'rsvp.changed', keys: answerKeys }],
  },
  {
    kind: PROPOSAL_INBOX_KIND.answered,
    event: 'rsvp.changed',
    source: 'crew',
    needsYou: true,
    resolvedBy: [{ event: 'trip.status_changed', keys: lockKeys }],
  },
  {
    kind: PROPOSAL_INBOX_KIND.tripLocked,
    event: 'trip.status_changed',
    source: 'crew',
    needsYou: false,
  },
];

for (const spec of PROPOSAL_INBOX_KINDS) registerInboxKind(spec);
