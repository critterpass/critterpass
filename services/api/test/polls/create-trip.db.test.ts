/**
 * `create_trip` and `add_poll_candidate` over the real stack: a crew trip is born voting with its
 * destination board in one transaction, later pitches join that board, a pitch during a final is
 * queued and seeds the next board, and a solo trip skips the vote. No committed voting crew trip
 * ever lacks an open destination poll.
 */
import { generateUuidV7, type CreateTripResult, type PitchToCrewResult } from '@cp/domain';
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
let crew: PollCrew;
let kyoto: string;
let lisbon: string;
let bali: string;

beforeAll(async () => {
  harness = await startPollDoors();
  crew = await buildPollCrew(harness, 4);
  [kyoto, lisbon, bali] = await Promise.all([
    insertPlace(harness, 'Kyoto', 'kyoto', 'live'),
    insertPlace(harness, 'Lisbon'),
    insertPlace(harness, 'Bali'),
  ]);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const query = <T extends object>(sql: string, params: unknown[] = []) =>
  harness.pool.query<T>(sql, params).then((r) => r.rows);

async function assertVotingTripsHaveOpenPolls(): Promise<void> {
  const orphans = await query(
    `SELECT t.id FROM trips t
      WHERE t.status = 'voting' AND NOT t.is_solo
        AND NOT EXISTS (SELECT 1 FROM polls p WHERE p.trip_id = t.id AND p.kind = 'destination'
                          AND p.status = 'open')`,
  );
  expect(orphans).toEqual([]);
}

describe('create_trip for a crew', () => {
  let tripId: string;
  let pollId: string;

  it('starts a voting trip with its destination board, the place on it, in one go', async () => {
    tripId = generateUuidV7();
    const response = await run(harness, crew.members[1]!, 'create_trip', {
      trip_id: tripId,
      crew_id: crew.crewId,
      place_id: kyoto,
      solo: false,
    });
    expect(response.status).toBe(200);
    const result = resultOf<CreateTripResult>(response);
    expect(result).toMatchObject({
      trip_id: tripId,
      status: 'voting',
      solo: false,
      ftf_eligible: true,
    });
    pollId = result.poll_id!;
    const [poll] = await query<{ stage: string; eligible: number; tie_rule: string }>(
      `SELECT stage, cardinality(eligible_voter_ids) AS eligible, tie_rule FROM polls WHERE id = $1`,
      [pollId],
    );
    expect(poll).toEqual({ stage: 'board', eligible: 4, tie_rule: 'organiser_pick' });
    expect(await query('SELECT label FROM poll_options WHERE poll_id = $1', [pollId])).toEqual([
      { label: 'Kyoto' },
    ]);
    expect(
      await query<{ role: string }>('SELECT role FROM trip_participants WHERE trip_id = $1', [
        tripId,
      ]),
    ).toEqual([{ role: 'organiser' }]);
    expect(
      await query("SELECT 1 FROM messages WHERE type = 'poll' AND ref_id = $1", [pollId]),
    ).toHaveLength(1);
    expect(
      await query(
        "SELECT slot FROM scheduled_events WHERE kind = 'poll.board_advance' AND ref_id = $1",
        [pollId],
      ),
    ).toHaveLength(1);
    await assertVotingTripsHaveOpenPolls();
  });

  it('puts a second place on the same board instead of starting another trip', async () => {
    const response = await run(harness, crew.members[2]!, 'add_poll_candidate', {
      crew_id: crew.crewId,
      place_id: lisbon,
    });
    expect(response.body).toMatchObject({ status: 'applied' });
    expect(resultOf<PitchToCrewResult>(response)).toMatchObject({
      outcome: 'added',
      poll_id: pollId,
      trip_id: tripId,
      eligible: 4,
      voted: 0,
    });
    const again = await run(harness, crew.members[3]!, 'create_trip', {
      crew_id: crew.crewId,
      place_id: lisbon,
      solo: false,
    });
    expect(resultOf<CreateTripResult>(again)).toMatchObject({ trip_id: tripId, poll_id: pollId });
    expect(
      await query('SELECT 1 FROM trips WHERE crew_id = $1 AND NOT is_solo', [crew.crewId]),
    ).toHaveLength(1);
  });

  it('queues a pitch while a final is on, and the queue seeds the next board', async () => {
    await query(`UPDATE polls SET stage = 'final' WHERE id = $1`, [pollId]);
    const queued = await run(harness, crew.members[1]!, 'add_poll_candidate', {
      crew_id: crew.crewId,
      place_id: bali,
    });
    expect(resultOf<PitchToCrewResult>(queued)).toMatchObject({
      outcome: 'queued',
      option_id: null,
    });
    await query(
      `UPDATE polls SET status = 'closed', closed_at = now(),
         winner_option_id = (SELECT id FROM poll_options WHERE poll_id = $1 LIMIT 1) WHERE id = $1`,
      [pollId],
    );
    await query("UPDATE trips SET status = 'won' WHERE id = $1", [tripId]);
    const next = await run(harness, crew.organiser, 'create_trip', {
      crew_id: crew.crewId,
      place_id: kyoto,
      solo: false,
    });
    const result = resultOf<CreateTripResult>(next);
    expect(result.trip_id).not.toBe(tripId);
    expect(result.ftf_eligible).toBe(false);
    const labels = await query<{ label: string }>(
      'SELECT label FROM poll_options WHERE poll_id = $1 ORDER BY position',
      [result.poll_id],
    );
    expect(labels.map((row) => row.label)).toEqual(['Kyoto', 'Bali']);
    await assertVotingTripsHaveOpenPolls();
  });

  it('hides a crew from an outsider', async () => {
    const outsider = await harness.signInAnonymously();
    const response = await run(harness, outsider, 'create_trip', {
      crew_id: crew.crewId,
      place_id: kyoto,
      solo: false,
    });
    expect(response.status).toBe(404);
  });
});

describe('create_trip solo', () => {
  it('skips the vote: setup, one seat, no poll, no free first trip', async () => {
    const response = await run(harness, crew.members[3]!, 'create_trip', {
      crew_id: crew.crewId,
      place_id: kyoto,
      solo: true,
    });
    expect(response.status).toBe(200);
    const result = resultOf<CreateTripResult>(response);
    expect(result).toMatchObject({
      status: 'setup',
      poll_id: null,
      solo: true,
      ftf_eligible: false,
    });
    const [trip] = await query<{ is_solo: boolean; seat_cap: number; destination_id: string }>(
      'SELECT is_solo, seat_cap, destination_id FROM trips WHERE id = $1',
      [result.trip_id],
    );
    expect(trip).toEqual({ is_solo: true, seat_cap: 1, destination_id: kyoto });
    expect(await query('SELECT 1 FROM polls WHERE trip_id = $1', [result.trip_id])).toEqual([]);
  });

  it('uses the caller’s crew when none is named, and needs a place that exists', async () => {
    const response = await run(harness, crew.members[2]!, 'create_trip', {
      place_id: bali,
      solo: true,
    });
    expect(resultOf<CreateTripResult>(response)).toMatchObject({ status: 'setup' });
    const missing = await run(harness, crew.members[2]!, 'create_trip', {
      place_id: generateUuidV7(),
      solo: true,
    });
    expect(errorCode(missing)).toBe('NOT_FOUND');
    const crewless = await run(harness, crew.members[2]!, 'create_trip', {
      place_id: bali,
      solo: false,
    });
    expect(errorCode(crewless)).toBe('VALIDATION');
  });

  it('starts a crew of one for a brand-new account, then reuses it for the next solo trip', async () => {
    const fresh = await harness.signInAnonymously();
    await harness.pool.query("UPDATE users SET display_name = 'Winston' WHERE id = $1", [
      fresh.uid,
    ]);
    const first = await run(harness, fresh, 'create_trip', { place_id: kyoto, solo: true });
    expect(first.status).toBe(200);
    const trip = resultOf<CreateTripResult>(first);
    expect(trip).toMatchObject({ status: 'setup', solo: true });

    const crews = await query<{ crew_id: string; role: string; name: string; active: boolean }>(
      `SELECT m.crew_id, m.role, c.name, s.active_crew_id = m.crew_id AS active
         FROM crew_members m JOIN crews c ON c.id = m.crew_id
         LEFT JOIN user_settings s ON s.user_id = m.user_id
        WHERE m.user_id = $1 AND m.status = 'active'`,
      [fresh.uid],
    );
    expect(crews).toHaveLength(1);
    const crewId = crews[0]!.crew_id;
    expect(crews[0]).toEqual({ crew_id: crewId, role: 'organiser', name: 'Winston', active: true });
    expect(await query('SELECT crew_id FROM trips WHERE id = $1', [trip.trip_id])).toEqual([
      { crew_id: crewId },
    ]);
    expect(
      await query("SELECT 1 FROM domain_events WHERE type = 'crew.created' AND crew_id = $1", [
        crewId,
      ]),
    ).toHaveLength(1);

    const second = await run(harness, fresh, 'create_trip', { place_id: lisbon, solo: true });
    expect(second.status).toBe(200);
    const again = resultOf<CreateTripResult>(second);
    expect(await query('SELECT crew_id FROM trips WHERE id = $1', [again.trip_id])).toEqual([
      { crew_id: crewId },
    ]);
    expect(
      await query("SELECT 1 FROM crew_members WHERE user_id = $1 AND status = 'active'", [
        fresh.uid,
      ]),
    ).toHaveLength(1);
  });
});
