/**
 * Poll rows for the shared permission fixture: a pitch and an open destination poll on the
 * fixture trip with one option, the organiser's ballot on it and the organiser's winner reveal.
 */
import type pg from 'pg';

export interface PollFixtureInput {
  readonly crewId: string;
  readonly tripId: string;
  readonly destinationId: string;
  readonly organiser: string;
  readonly member: string;
}

export async function seedPollRows(tx: pg.PoolClient, input: PollFixtureInput): Promise<void> {
  const { rows: pitchRows } = await tx.query<{ id: string }>(
    `INSERT INTO pitches (crew_id, trip_id, destination_id, pitched_by, cache_key, status)
     VALUES ($1, $2, $3, $4, 'matrix-probe', 'on_board') RETURNING id`,
    [input.crewId, input.tripId, input.destinationId, input.organiser],
  );
  const { rows: pollRows } = await tx.query<{ id: string }>(
    `INSERT INTO polls (crew_id, trip_id, kind, stage, created_by, eligible_voter_ids, closes_at,
       tie_rule)
     VALUES ($1, $2, 'destination', 'board', $3, ARRAY[$3, $4]::uuid[], now() + interval '7 days',
       'organiser_pick')
     RETURNING id`,
    [input.crewId, input.tripId, input.organiser, input.member],
  );
  const pollId = pollRows[0]!.id;
  const { rows: optionRows } = await tx.query<{ id: string }>(
    `INSERT INTO poll_options (poll_id, crew_id, kind, ref_id, label, pitch_id, proposed_by, position)
     VALUES ($1, $2, 'destination', $3, 'Matrix Probe', $4, $5, 0) RETURNING id`,
    [pollId, input.crewId, input.destinationId, pitchRows[0]!.id, input.organiser],
  );
  await tx.query(
    `INSERT INTO ballots (poll_id, option_id, crew_id, user_id, op_id)
     VALUES ($1, $2, $3, $4, uuidv7())`,
    [pollId, optionRows[0]!.id, input.crewId, input.organiser],
  );
  await tx.query('INSERT INTO poll_reveals (poll_id, user_id) VALUES ($1, $2)', [
    pollId,
    input.organiser,
  ]);
}
