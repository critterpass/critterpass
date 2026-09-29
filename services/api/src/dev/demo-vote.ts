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
import { ballotSourceForVia, generateUuidV7 } from '@cp/domain';
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
  },
  {
    slug: 'lisbon',
    name: 'Lisbon',
    country: 'Portugal',
    currency: 'EUR',
    tz: 'Europe/Lisbon',
    pitchedBy: 'maya',
    backers: ['alex', 'rin'],
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
    if (result.option_id !== null) optionBySlug.set(place.slug, result.option_id);
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
