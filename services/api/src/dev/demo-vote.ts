/**
 * The demo crew's destination vote, built through the polls feature's own writes: `pitchToCrew`
 * starts the vote with the caller's pitch (so the caller organises it) and puts three crewmates'
 * pitches on the board, and `advanceBoardInTx` / `reopenBoardInTx` move it between board and final.
 * The crewmates' ballots are rows in `ballots`, one per voter, as `cast_ballot` stores them.
 *
 * Maya and Jordan back the caller's Kyoto, Alex and Rin back Maya's Lisbon: the board's top two
 * are clear (GO TO THE FINAL needs no pick), both carry into the final 2–2, and the caller's own
 * ballot is the last one needed, so a single device drives board → final → showdown → reveal.
 * Every seed resets to that state: the caller's ballot is removed and a final is reopened first.
 */
import {
  advanceBoardInTx,
  loadPollState,
  publishPollHints,
  reopenBoardInTx,
  tallyOf,
  type PollState,
} from '@cp/db';
import {
  ballotSourceForVia,
  generateUuidV7,
  pitchSectionsSchema,
  type PitchSections,
} from '@cp/domain';
import type pg from 'pg';

import { openDestinationPoll } from '../commands/polls/candidates';
import { pitchToCrew, resolvePlace } from '../commands/polls/destination';
import type { DemoMember, DemoWorld } from './demo-world';

export type DemoVoteStage = 'board' | 'final';

type Voter = DemoMember['key'] | 'me';

interface VotePlace {
  readonly slug: string;
  readonly name: string;
  readonly country: string;
  readonly currency: string;
  readonly tz: string;
  readonly pitchedBy: Voter;
  readonly backers: readonly DemoMember['key'][];
  /** What the finalists' guides said and the tools found, for the showdown's bubble and chips. */
  readonly pitch?: {
    readonly flightMin: number;
    readonly priceMinor: number;
    readonly bestMonths: readonly number[];
    readonly quote: string;
  };
}

/** The caller's pitch first: whoever starts the vote organises it. */
const VOTE_PLACES: readonly VotePlace[] = [
  {
    slug: 'kyoto',
    name: 'Kyoto',
    country: 'Japan',
    currency: 'JPY',
    tz: 'Asia/Tokyo',
    pitchedBy: 'me',
    backers: ['maya', 'jordan'],
    pitch: {
      flightMin: 420,
      priceMinor: 148_000,
      bestMonths: [4],
      quote: 'Come in April. The blossoms are ridiculous.',
    },
  },
  {
    slug: 'lisbon',
    name: 'Lisbon',
    country: 'Portugal',
    currency: 'EUR',
    tz: 'Europe/Lisbon',
    pitchedBy: 'maya',
    backers: ['alex', 'rin'],
    pitch: {
      flightMin: 960,
      priceMinor: 192_000,
      bestMonths: [6],
      quote: 'Grilled sardines. Every. Single. Night.',
    },
  },
  {
    slug: 'iceland',
    name: 'Iceland',
    country: 'Iceland',
    currency: 'ISK',
    tz: 'Atlantic/Reykjavik',
    pitchedBy: 'jordan',
    backers: [],
  },
  {
    slug: 'mexico-city',
    name: 'Mexico City',
    country: 'Mexico',
    currency: 'MXN',
    tz: 'America/Mexico_City',
    pitchedBy: 'alex',
    backers: [],
  },
];

export interface DemoVote {
  readonly pollId: string;
  readonly tripId: string;
}

async function placeId(tx: pg.PoolClient, place: VotePlace): Promise<string> {
  await tx.query(
    `INSERT INTO destinations (slug, name, country, coverage, currency, tz)
     VALUES ($1, $2, $3, 'live', $4, $5) ON CONFLICT (slug) DO NOTHING`,
    [place.slug, place.name, place.country, place.currency, place.tz],
  );
  const { rows } = await tx.query<{ id: string }>('SELECT id FROM destinations WHERE slug = $1', [
    place.slug,
  ]);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`demo seed: no destination ${place.slug}`);
  return id;
}

/** The home the demo crew flies from. */
const DEMO_ORIGIN = 'SIN';

/**
 * Stores a finalist's pitch the way a streamed one is stored: the sticker from the destination
 * (its guide and country), the tool chips and the guide's quote. A pitch that already has
 * sections keeps them, so reseeding changes nothing.
 */
async function fillPitchSections(
  tx: pg.PoolClient,
  optionId: string,
  pitch: NonNullable<VotePlace['pitch']>,
): Promise<void> {
  const { rows } = await tx.query<{
    pitch_id: string | null;
    empty: boolean;
    place_id: string;
    name: string;
    country: string | null;
    coverage: 'live' | 'guest';
    guide: string;
  }>(
    `SELECT o.pitch_id, coalesce(p.sections, '{}'::jsonb) = '{}'::jsonb AS empty, d.id AS place_id,
            d.name, d.country, d.coverage, coalesce(s.guide_slug, 'tokek') AS guide
       FROM poll_options o
       JOIN destinations d ON d.id = o.ref_id
       LEFT JOIN critter_sets s ON s.id = d.critter_set_id
       LEFT JOIN pitches p ON p.id = o.pitch_id
      WHERE o.id = $1`,
    [optionId],
  );
  const row = rows[0];
  if (row?.pitch_id == null || !row.empty) return;
  const sections: PitchSections = pitchSectionsSchema.parse({
    sticker: {
      place_id: row.place_id,
      name: row.name,
      country: row.country,
      coverage: row.coverage,
      guide: row.guide,
    },
    headline: null,
    chips: [
      { kind: 'flight', minutes: pitch.flightMin, origin: DEMO_ORIGIN },
      { kind: 'price', amount_minor: pitch.priceMinor, currency: 'USD', origin: DEMO_ORIGIN },
      { kind: 'best_months', months: pitch.bestMonths },
    ],
    reasons: [],
    quote: pitch.quote,
    alternatives: [],
  });
  await tx.query('UPDATE pitches SET sections = $2 WHERE id = $1', [row.pitch_id, sections]);
}

async function state(tx: pg.PoolClient, pollId: string): Promise<PollState> {
  const found = await loadPollState(tx, pollId, 'update');
  if (found === undefined) throw new Error('demo seed: the vote vanished');
  return found;
}

/** Back on the board with the four places, the crewmates' ballots and none of the caller's. */
async function boardWithBallots(
  tx: pg.PoolClient,
  world: DemoWorld,
  uid: string,
  now: Date,
): Promise<DemoVote> {
  const open = await openDestinationPoll(tx, world.crewId);
  if (open?.stage === 'final') {
    await reopenBoardInTx(tx, await state(tx, open.id), { now, actorId: uid });
  }
  const voters: Readonly<Record<Voter, string>> = { ...world.members, me: uid };
  let vote: DemoVote | undefined;
  const optionBySlug = new Map<string, string>();
  for (const place of VOTE_PLACES) {
    const result = await pitchToCrew(tx, {
      crewId: world.crewId,
      place: await resolvePlace(tx, await placeId(tx, place)),
      uid: voters[place.pitchedBy],
      now,
    });
    if (result.poll_id === null || result.trip_id === null) {
      throw new Error(`demo seed: ${place.name} was ${result.outcome}, not put to the vote`);
    }
    vote ??= { pollId: result.poll_id, tripId: result.trip_id };
    if (result.option_id !== null) {
      optionBySlug.set(place.slug, result.option_id);
      if (place.pitch !== undefined) await fillPitchSections(tx, result.option_id, place.pitch);
    }
  }
  if (vote === undefined) throw new Error('demo seed: no vote was opened');

  await tx.query('DELETE FROM ballots WHERE poll_id = $1 AND user_id = $2', [vote.pollId, uid]);
  for (const place of VOTE_PLACES) {
    const optionId = optionBySlug.get(place.slug);
    if (optionId === undefined) continue;
    for (const backer of place.backers) {
      await tx.query(
        `INSERT INTO ballots (poll_id, option_id, crew_id, user_id, source, op_id, cast_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (poll_id, user_id) DO UPDATE SET option_id = EXCLUDED.option_id`,
        [
          vote.pollId,
          optionId,
          world.crewId,
          world.members[backer],
          ballotSourceForVia('online'),
          generateUuidV7(),
          now,
        ],
      );
    }
  }
  return vote;
}

/** The demo crew's open destination vote on its board, or already in its final. */
export async function ensureDemoVote(
  tx: pg.PoolClient,
  world: DemoWorld,
  uid: string,
  stage: DemoVoteStage,
  now: Date,
): Promise<DemoVote> {
  const vote = await boardWithBallots(tx, world, uid, now);
  if (stage === 'final') {
    const outcome = await advanceBoardInTx(tx, await state(tx, vote.pollId), {
      now,
      actorId: uid,
    });
    if (outcome.outcome !== 'advanced') {
      throw new Error(`demo seed: the vote did not reach its final (${outcome.outcome})`);
    }
  }
  const after = await state(tx, vote.pollId);
  await publishPollHints(tx, after, tallyOf(after), 'poll.updated');
  return vote;
}
