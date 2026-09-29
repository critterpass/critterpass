/**
 * Poll, ballot, pitch and saved-place domain events (docs/api-contracts.md §4.3, §4.4). Payloads
 * carry ids and enum values only: never a question, an option label or a price.
 */
import { z } from 'zod';

import {
  ballotSourceSchema,
  pollCloseReasonSchema,
  pollKindSchema,
  pollStageSchema,
} from './kinds';

export const POLL_EVENT_TYPES = [
  'poll.created',
  'poll.candidate_added',
  'poll.candidate_removed',
  'poll.stage_changed',
  'poll.closed',
  'poll.cancelled',
  'poll.reveal_seen',
  'poll.lead_changed',
  'poll.closing_soon',
  'ballot.cast',
  'ballot.changed',
  'ballot.retracted',
  'pitch.created',
  'pitch.queued',
  'place.saved',
  'place.unsaved',
] as const;
export type PollEventType = (typeof POLL_EVENT_TYPES)[number];

const pollRef = z.object({ poll_id: z.uuid() });
const ballotRef = pollRef.extend({ user_id: z.uuid() });
const pitchRef = z.object({ pitch_id: z.uuid(), crew_id: z.uuid(), destination_id: z.uuid() });
const placeRef = z.object({ user_id: z.uuid(), place_id: z.uuid() });

export const POLL_EVENT_PAYLOADS = {
  'poll.created': pollRef.extend({
    crew_id: z.uuid(),
    trip_id: z.uuid().nullable(),
    kind: pollKindSchema,
    created_by: z.uuid().nullable(),
  }),
  'poll.candidate_added': pollRef.extend({
    option_id: z.uuid(),
    destination_id: z.uuid().nullable(),
    pitch_id: z.uuid().nullable(),
    proposed_by: z.uuid().nullable(),
  }),
  'poll.candidate_removed': pollRef.extend({ option_id: z.uuid() }),
  'poll.stage_changed': pollRef.extend({ from: pollStageSchema, to: pollStageSchema }),
  'poll.closed': pollRef.extend({
    crew_id: z.uuid(),
    trip_id: z.uuid().nullable(),
    kind: pollKindSchema,
    winner_option_id: z.uuid().nullable(),
    reason: pollCloseReasonSchema,
    /** The tie rule picked the winner. */
    tie_broken: z.boolean(),
  }),
  'poll.cancelled': pollRef,
  'poll.reveal_seen': ballotRef,
  // A different option now leads (inbox live body, the empty-state watch line).
  'poll.lead_changed': pollRef.extend({ leader_option_id: z.uuid() }),
  // A reminder timer fired for the voters who have not voted yet (`slot`: 24h or 2h).
  'poll.closing_soon': pollRef.extend({ slot: z.enum(['24h', '2h']) }),
  'ballot.cast': ballotRef.extend({ option_id: z.uuid(), source: ballotSourceSchema }),
  'ballot.changed': ballotRef.extend({ option_id: z.uuid(), source: ballotSourceSchema }),
  'ballot.retracted': ballotRef,
  'pitch.created': pitchRef,
  'pitch.queued': pitchRef,
  'place.saved': placeRef,
  'place.unsaved': placeRef,
} as const satisfies Record<PollEventType, z.ZodType>;
