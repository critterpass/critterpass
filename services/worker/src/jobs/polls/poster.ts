/**
 * What the vote poster (the `cp.vote` notification's expanded view, and the Android vote
 * notification) draws on its first frame without a fetch: each live answer's critter and colour
 * with its count, how many of the crew have voted, and when it closes. A destination answer wears
 * its city's guide (the one a trip there would get); any other answer the trip's guide, the colours
 * taking turns. Counts are as of the push; the poster refreshes them when it opens.
 */
import { tallyOf, type PollState } from '@cp/db';
import { GUIDE_COLOURS, unixSeconds, type GuideColour } from '@cp/domain';
import type pg from 'pg';

import type { NotificationSender } from '../notify/register';
import { pollData } from './facts';

export interface OptionArt {
  /** Guide slug, which is the critter art key the poster draws. */
  readonly critter: string;
  readonly tone: GuideColour;
}

/** The colours answers take in turn when their guide gives none (design: tangerine, then mint). */
const TURNS: readonly GuideColour[] = ['orange', 'green', 'blue', 'pink', 'yellow'];

function toneOf(value: string | null | undefined): GuideColour | undefined {
  return (GUIDE_COLOURS as readonly string[]).includes(value ?? '')
    ? (value as GuideColour)
    : undefined;
}

/** The guide of each destination answer, keyed by option id. */
export async function destinationArt(
  tx: pg.PoolClient,
  state: PollState,
): Promise<Map<string, { slug: string; colour: string | null }>> {
  const destinations = state.options.filter((o) => o.kind === 'destination' && o.ref_id !== null);
  if (destinations.length === 0) return new Map();
  const { rows } = await tx.query<{ option_id: string; slug: string; colour: string | null }>(
    `SELECT o.id AS option_id, g.slug, g.colour
       FROM poll_options o
       JOIN guides g ON g.id = app.destination_guide_id(o.ref_id)
      WHERE o.poll_id = $1 AND o.kind = 'destination'`,
    [state.poll.id],
  );
  return new Map(rows.map((row) => [row.option_id, { slug: row.slug, colour: row.colour }]));
}

/** The poster's context: the poll's own fields plus the art, counts and turnout. */
export function votePosterContext(
  state: PollState,
  guide: NotificationSender,
  destinations: ReadonlyMap<string, { slug: string; colour: string | null }>,
): Record<string, unknown> {
  const base = pollData(state, guide);
  const tally = tallyOf(state);
  const counts = new Map(tally.options.map((option) => [option.optionId, option.count]));
  const options = (base['options'] as { id: string; label: string }[]).map((option, index) => {
    const destination = destinations.get(option.id);
    const art: OptionArt = {
      critter: destination?.slug ?? guide.id,
      tone: toneOf(destination?.colour) ?? TURNS[index % TURNS.length] ?? 'orange',
    };
    return { ...option, ...art, count: counts.get(option.id) ?? 0 };
  });
  const eligible = state.poll.eligible_voter_ids.length;
  return {
    ...base,
    options,
    voted: eligible - tally.pendingVoterIds.length,
    eligible,
    closes_at: state.poll.closes_at === null ? null : unixSeconds(state.poll.closes_at),
  };
}

export async function votePosterCtx(
  tx: pg.PoolClient,
  state: PollState,
  guide: NotificationSender,
): Promise<Record<string, unknown>> {
  return votePosterContext(state, guide, await destinationArt(tx, state));
}
