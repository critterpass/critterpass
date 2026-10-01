/**
 * A destination board with a single place: the organiser locks it in with `close_poll` and it wins
 * (the trip goes `won` with that destination, the pitch is won), while a member cannot, and a board
 * with two places still advances to its final instead of closing.
 */
import type { CreateTripResult, PollTallyResult } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CommandDoorsHarness } from '../routes/command-doors-harness';
import {
  buildPollCrew,
  errorCode,
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

async function openBoard(): Promise<{
  crew: PollCrew;
  tripId: string;
  pollId: string;
  placeId: string;
}> {
  const crew = await buildPollCrew(harness, 2);
  const placeId = await insertPlace(harness, 'Hoi An');
  const created = await run(harness, crew.organiser, 'create_trip', {
    crew_id: crew.crewId,
    place_id: placeId,
    solo: false,
  });
  const { trip_id: tripId, poll_id: pollId } = resultOf<CreateTripResult>(created) as {
    trip_id: string;
    poll_id: string;
  };
  return { crew, tripId, pollId, placeId };
}

describe('locking in a single place', () => {
  it('lets the organiser close a one-place board with that place as the winner', async () => {
    const { crew, tripId, pollId, placeId } = await openBoard();
    const [option] = await query<{ id: string }>('SELECT id FROM poll_options WHERE poll_id = $1', [
      pollId,
    ]);

    const refused = await run(harness, crew.members[1]!, 'close_poll', { poll_id: pollId });
    expect(errorCode(refused)).toBe('FORBIDDEN');

    const closed = resultOf<PollTallyResult>(
      await run(harness, crew.organiser, 'close_poll', { poll_id: pollId }),
    );
    expect(closed.status).toBe('closed');
    expect(closed.winner_option_id).toBe(option?.id);

    const [trip] = await query<{ status: string; destination_id: string }>(
      'SELECT status, destination_id FROM trips WHERE id = $1',
      [tripId],
    );
    expect(trip).toEqual({ status: 'won', destination_id: placeId });
    const [pitch] = await query<{ status: string }>(
      'SELECT status FROM pitches WHERE trip_id = $1',
      [tripId],
    );
    expect(pitch?.status).toBe('won');
  });

  it('still takes a board with two places to its final instead', async () => {
    const other = await insertPlace(harness, 'Da Lat');
    const { crew, pollId } = await openBoard();
    await run(harness, crew.members[1]!, 'add_poll_candidate', {
      crew_id: crew.crewId,
      place_id: other,
    });

    const refused = await run(harness, crew.organiser, 'close_poll', { poll_id: pollId });
    expect(errorCode(refused)).toBe('STATE_INVALID');
    const [poll] = await query<{ status: string }>('SELECT status FROM polls WHERE id = $1', [
      pollId,
    ]);
    expect(poll?.status).toBe('open');
  });
});
