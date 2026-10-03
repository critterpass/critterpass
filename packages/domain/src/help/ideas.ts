/**
 * The idea board (docs/api-contracts.md §4.16): suggestions anyone can vote on, ten votes per
 * calendar month in the voter's own time zone, a vote taken back returning to that month's budget.
 */
import { z } from 'zod';

import { uuidV7Schema } from '../ids';

export const IDEA_VOTE_BUDGET = 10;

export const IDEA_STATUSES = [
  'pending_review',
  'open',
  'planned',
  'building',
  'shipped',
  'declined',
  'merged',
] as const;
export const ideaStatusSchema = z.enum(IDEA_STATUSES);
export type IdeaStatus = z.infer<typeof ideaStatusSchema>;

/** Visible to everyone; `pending_review` only to its author until the team publishes it. */
export const PUBLIC_IDEA_STATUSES = [
  'open',
  'planned',
  'building',
  'shipped',
  'declined',
  'merged',
] as const satisfies readonly IdeaStatus[];

/** Statuses that still take votes. */
export const VOTABLE_IDEA_STATUSES = [
  'open',
  'planned',
  'building',
] as const satisfies readonly IdeaStatus[];

export const IDEA_TITLE_MIN = 8;
export const IDEA_TITLE_MAX = 80;
export const IDEA_DESCRIPTION_MAX = 1000;

/** The budget's month, `YYYY-MM`, on the voter's calendar. */
export function ideaVoteMonth(at: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(at);
  const year = parts.find((p) => p.type === 'year')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  return `${year}-${month}`;
}

/** Votes left this month: the budget less the votes cast in it that still stand. */
export function ideaVotesLeft(votesThisMonth: number): number {
  return Math.max(0, IDEA_VOTE_BUDGET - votesThisMonth);
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase();
}

/**
 * Whether the text holds a blocked word: a whole word, or inside another for words of five letters
 * or more (the same rule as names on a pass).
 */
export function hasBlockedWord(text: string, blockedWords: readonly string[]): boolean {
  const folded = fold(text);
  const tokens = folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const squashed = folded.replace(/[^\p{L}\p{N}]+/gu, '');
  return blockedWords.some((word) => {
    const w = fold(word).replace(/[^\p{L}\p{N}]+/gu, '');
    return w.length > 0 && (tokens.includes(w) || (w.length >= 5 && squashed.includes(w)));
  });
}

export const submitIdeaPayloadSchema = z.strictObject({
  id: uuidV7Schema,
  title: z.string().trim().min(IDEA_TITLE_MIN).max(IDEA_TITLE_MAX),
  description: z.string().trim().max(IDEA_DESCRIPTION_MAX).nullable().default(null),
  locale: z.string().min(2).max(35),
});
export type SubmitIdeaPayload = z.infer<typeof submitIdeaPayloadSchema>;

export const voteIdeaPayloadSchema = z.strictObject({ idea_id: z.uuid() });
export type VoteIdeaPayload = z.infer<typeof voteIdeaPayloadSchema>;

export interface VoteIdeaResult {
  readonly idea_id: string;
  readonly votes_left: number;
  readonly votes_count: number;
}
