/**
 * The poll engine's inbox kinds (docs/api-contracts-async.md §2.2 `inbox.fanout`):
 *
 * - `poll.vote_needed` (needs you): a vote opened that you can answer; up to three answers inline;
 *   the card's live body ("Penida leads 4–2") is drawn from the synced tallies. Settled by your
 *   ballot from any surface (and by a nudge's key about the same poll), or by the close.
 * - `poll.final_open` (needs you): the destination board went to its two-place final and you have
 *   not picked one of them; settled the same way.
 * - `poll.pick_needed` (needs you, organiser): the board's deadline found a tie for a final spot.
 * - `poll.result` (earlier): the vote closed; the winner and score.
 */
import { nudgeResolveKey } from '../inbox/kinds';
import { registerInboxKind, type InboxKindSpec } from '../inbox/registry';

export const POLL_INBOX_KIND = {
  voteNeeded: 'poll.vote_needed',
  finalOpen: 'poll.final_open',
  pickNeeded: 'poll.pick_needed',
  result: 'poll.result',
} as const;

/** Chat and notification cards list the answers inline only up to this many. */
export const INLINE_POLL_OPTIONS_MAX = 3;

/** Settles the voter's "vote needed" cards for one poll. */
export function pollVoteResolveKey(uid: string, pollId: string): string {
  return `poll:${uid}:${pollId}`;
}

export function pollPickResolveKey(pollId: string): string {
  return `poll_pick:${pollId}`;
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const settledByBallot = [
  {
    event: 'ballot.cast',
    keys: (payload: Readonly<Record<string, unknown>>) => {
      const uid = text(payload['user_id']);
      const poll = text(payload['poll_id']);
      return uid === null || poll === null
        ? []
        : [pollVoteResolveKey(uid, poll), nudgeResolveKey(uid, 'poll', poll)];
    },
  },
] as const;

export const POLL_INBOX_KINDS: readonly InboxKindSpec[] = [
  {
    kind: POLL_INBOX_KIND.voteNeeded,
    event: 'poll.created',
    source: 'crew',
    needsYou: true,
    resolvedBy: settledByBallot,
  },
  {
    kind: POLL_INBOX_KIND.finalOpen,
    event: 'poll.stage_changed',
    source: 'guide',
    needsYou: true,
    resolvedBy: [
      {
        event: 'ballot.changed',
        keys: (payload) => settledByBallot[0].keys(payload),
      },
    ],
  },
  {
    kind: POLL_INBOX_KIND.pickNeeded,
    event: 'poll.pick_needed',
    source: 'guide',
    needsYou: true,
    resolvedBy: (['poll.stage_changed', 'poll.closed'] as const).map((event) => ({
      event,
      keys: (payload: Readonly<Record<string, unknown>>) => {
        const poll = text(payload['poll_id']);
        return poll === null ? [] : [pollPickResolveKey(poll)];
      },
    })),
  },
  { kind: POLL_INBOX_KIND.result, event: 'poll.closed', source: 'guide', needsYou: false },
];

for (const spec of POLL_INBOX_KINDS) registerInboxKind(spec);
