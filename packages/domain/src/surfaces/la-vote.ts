/**
 * The vote-closing Live Activity: push-to-start a day before a poll closes, the live tallies, and
 * a "you voted" stamp. The ContentState goes out on the poll's broadcast channel, so it lists who
 * voted as member hashes and each device stamps itself when its own hash is in the list.
 */
import { z } from 'zod';

import {
  laLine,
  laMemberHash,
  memberHashSchema,
  unixSeconds,
  unixSecondsSchema,
} from './la-common';

/** Push-to-start this long before the poll closes. */
export const LA_VOTE_LEAD_MS = 24 * 3_600_000;
export const LA_VOTE_MAX_OPTIONS = 4;
export const LA_VOTE_MAX_VOTERS = 16;

export const voteLaAttributesSchema = z.object({
  poll_id: z.uuid(),
  question: z.string().max(80),
});
export type VoteLaAttributes = z.infer<typeof voteLaAttributesSchema>;

export const voteLaTallySchema = z.object({
  option_id: z.uuid(),
  label: z.string().max(32),
  count: z.number().int().nonnegative(),
  leading: z.boolean(),
});

export const voteLaStateSchema = z.object({
  seq: z.number().int().nonnegative(),
  state: z.enum(['open', 'closed', 'cancelled']),
  closes_at: unixSecondsSchema,
  tallies: z.array(voteLaTallySchema).max(LA_VOTE_MAX_OPTIONS),
  voted: z.array(memberHashSchema).max(LA_VOTE_MAX_VOTERS),
  eligible: z.number().int().nonnegative(),
  winner_label: z.string().max(32).nullable(),
});
export type VoteLaState = z.infer<typeof voteLaStateSchema>;

export interface VoteLaInput {
  readonly pollId: string;
  readonly question: string;
  readonly status: 'open' | 'closed' | 'cancelled';
  readonly closesAt: Date;
  readonly options: readonly {
    readonly id: string;
    readonly label: string;
    readonly count: number;
  }[];
  readonly voterIds: readonly string[];
  readonly eligibleCount: number;
  readonly winnerOptionId: string | null;
}

export function buildVoteLaAttributes(input: VoteLaInput): VoteLaAttributes {
  return { poll_id: input.pollId, question: laLine(input.question, 80) };
}

export function buildVoteLaState(input: VoteLaInput, seq: number): VoteLaState {
  const top = Math.max(0, ...input.options.map((o) => o.count));
  const ranked = [...input.options].sort((a, b) => b.count - a.count).slice(0, LA_VOTE_MAX_OPTIONS);
  const winner = input.options.find((o) => o.id === input.winnerOptionId);
  return {
    seq,
    state: input.status,
    closes_at: unixSeconds(input.closesAt),
    tallies: ranked.map((o) => ({
      option_id: o.id,
      label: laLine(o.label, 32),
      count: o.count,
      leading: top > 0 && o.count === top,
    })),
    voted: input.voterIds
      .slice(0, LA_VOTE_MAX_VOTERS)
      .map((uid) => laMemberHash(input.pollId, uid)),
    eligible: input.eligibleCount,
    winner_label: winner === undefined ? null : laLine(winner.label, 32),
  };
}
