/**
 * The crew's combined answer about a driver (6g-1): any member can answer the card, and the listing
 * shows one answer per crew per driver per trip. The verdict is the plurality; a tie takes the more
 * cautious of the tied verdicts, so two members who disagree never read as "loved". Tags count when
 * at least two members picked them, or every tag when only one member answered.
 */
import { z } from 'zod';

export const DRIVER_VERDICTS = ['loved', 'fine', 'not_again'] as const;
export type DriverVerdict = (typeof DRIVER_VERDICTS)[number];
export const driverVerdictSchema = z.enum(DRIVER_VERDICTS);

/** The tags a crew can pick on the card, in the order the card lists them. */
export const DRIVER_TAGS = [
  'on_time',
  'safe_driver',
  'knew_the_spots',
  'good_english',
  'fair_price',
  'patient',
  'great_photos',
  'new_car',
] as const;
export type DriverTag = (typeof DRIVER_TAGS)[number];
export const driverTagSchema = z.enum(DRIVER_TAGS);

/** Most cautious first: the tie-break order. */
const CAUTION_ORDER: readonly DriverVerdict[] = ['not_again', 'fine', 'loved'];

export interface DriverVote {
  readonly verdict: DriverVerdict;
  readonly tags: readonly DriverTag[];
}

export interface CrewDriverAnswer {
  readonly verdict: DriverVerdict;
  readonly tags: readonly DriverTag[];
  readonly voters: number;
}

export function combineCrewAnswer(votes: readonly DriverVote[]): CrewDriverAnswer | null {
  if (votes.length === 0) return null;
  const counts = new Map<DriverVerdict, number>();
  for (const vote of votes) counts.set(vote.verdict, (counts.get(vote.verdict) ?? 0) + 1);
  const top = Math.max(...counts.values());
  const verdict = CAUTION_ORDER.find((candidate) => counts.get(candidate) === top) ?? 'fine';

  const tagCounts = new Map<DriverTag, number>();
  for (const vote of votes) {
    for (const tag of new Set(vote.tags)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const needed = votes.length === 1 ? 1 : 2;
  const tags = DRIVER_TAGS.filter((tag) => (tagCounts.get(tag) ?? 0) >= needed);
  return { verdict, tags, voters: votes.length };
}

/** Trip statuses after the trip ended: the rate card opens then, never before. */
export const DRIVER_RATING_TRIP_STATUSES = ['post_trip', 'archived'] as const;

export const DRIVER_TIP_MAX_CHARS = 280;
