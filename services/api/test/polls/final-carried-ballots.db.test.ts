/**
 * A destination board's ballots carry into the final. When every eligible voter's ballot already
 * sits on one of the two finalists, the final is decided the moment the organiser moves on, so it
 * closes then instead of waiting days for a ballot nobody needs to cast. A voter still missing
 * keeps it open.
 */
import type { CreateTripResult } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CommandDoorsHarness, SignedIn } from '../routes/command-doors-harness';
import {
  buildPollCrew,
  insertPlace,
  resultOf,
  run,
  startPollDoors,
  type PollCrew,
} from './poll-fixture';

let harness: CommandDoorsHarness;

beforeAll(async () => {
  harness = await startPollDoors();
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const query = <T extends object>(sql: string, params: unknown[] = []) =>
  harness.pool.query<T>(sql, params).then((r) => r.rows);

interface Board {
  readonly crew: PollCrew;
  readonly tripId: string;
  readonly pollId: string;
  readonly optionOf: Record<string, string>;
}

/** A board on `crew` with one option per place, the first pitched by the organiser. */
async function openBoard(crew: PollCrew, placeNames: readonly string[]): Promise<Board> {
  const placeIds = [];
  for (const name of placeNames) placeIds.push(await insertPlace(harness, name));
  const created = await run(harness, crew.organiser, 'create_trip', {
    crew_id: crew.crewId,
    place_id: placeIds[0],
    solo: false,
  });
  const { trip_id: tripId, poll_id: pollId } = resultOf<CreateTripResult>(created) as {
    trip_id: string;
    poll_id: string;
  };
  for (const placeId of placeIds.slice(1)) {
    await run(harness, crew.organiser, 'add_poll_candidate', {
      crew_id: crew.crewId,
      place_id: placeId,
    });
  }
  const optionOf: Record<string, string> = {};
  for (const row of await query<{ id: string; ref_id: string }>(
    'SELECT id, ref_id FROM poll_options WHERE poll_id = $1',
    [pollId],
  )) {
    optionOf[placeNames[placeIds.indexOf(row.ref_id)]!] = row.id;
  }
  return { crew, tripId, pollId, optionOf };
}

const vote = (board: Board, who: SignedIn, place: string) =>
  run(harness, who, 'cast_ballot', { poll_id: board.pollId, option_id: board.optionOf[place] });

async function pollRow(pollId: string) {
  const [row] = await query<{ status: string; stage: string; winner_option_id: string | null }>(
    'SELECT status, stage, winner_option_id FROM polls WHERE id = $1',
    [pollId],
  );
  return row!;
}

async function tripStatus(tripId: string): Promise<string | undefined> {
  const [row] = await query<{ status: string }>('SELECT status FROM trips WHERE id = $1', [tripId]);
  return row?.status;
}

describe('ballots carried into the final', { timeout: 120_000 }, () => {
  it('closes the final at once for a crew of one whose ballot is on a finalist', async () => {
    const board = await openBoard(await buildPollCrew(harness, 1), ['Da Nang', 'Lisbon']);
    expect((await vote(board, board.crew.organiser, 'Da Nang')).status).toBe(200);

    const advanced = await run(harness, board.crew.organiser, 'advance_poll_stage', {
      poll_id: board.pollId,
    });

    expect(advanced.status).toBe(200);
    expect(await pollRow(board.pollId)).toEqual({
      status: 'closed',
      stage: 'final',
      winner_option_id: board.optionOf['Da Nang'],
    });
    expect(await tripStatus(board.tripId)).toBe('won');
  });

  it('closes the final at once when every voter already backs one of the two finalists', async () => {
    const board = await openBoard(await buildPollCrew(harness, 3), ['Kyoto', 'Lisbon', 'Bali']);
    const [first, second, third] = board.crew.members;
    await vote(board, first!, 'Kyoto');
    await vote(board, second!, 'Kyoto');
    await vote(board, third!, 'Lisbon');

    await run(harness, board.crew.organiser, 'advance_poll_stage', { poll_id: board.pollId });

    expect(await pollRow(board.pollId)).toEqual({
      status: 'closed',
      stage: 'final',
      winner_option_id: board.optionOf['Kyoto'],
    });
    expect(await tripStatus(board.tripId)).toBe('won');
  });

  it('keeps the final open while an eligible voter has not voted', async () => {
    const board = await openBoard(await buildPollCrew(harness, 3), ['Kyoto', 'Lisbon']);
    const [first, second] = board.crew.members;
    await vote(board, first!, 'Kyoto');
    await vote(board, second!, 'Lisbon');

    await run(harness, board.crew.organiser, 'advance_poll_stage', { poll_id: board.pollId });

    expect(await pollRow(board.pollId)).toMatchObject({ status: 'open', stage: 'final' });
    expect(await tripStatus(board.tripId)).toBe('voting');
  });
});
