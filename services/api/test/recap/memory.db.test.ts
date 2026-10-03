/**
 * The year-later memory's commands through the real `/v1/cmd` door against a migrated Postgres:
 * a traveller's reaction lands once and a new one replaces it, live on `memory:{id}`; a crewmate
 * who never travelled cannot react; a reunion pitches the trip's place into a new destination
 * vote, a replay answers the same vote, and a traveller who left the crew cannot start one.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPollCommands } from '../../src/commands/polls';
import { registerRecapCommands } from '../../src/commands/recap';
import { startJobProducer } from '../../src/jobs/producer';
import { runCommand } from '../location/location-fixture';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let producer: PgBoss;
let anna: SignedIn;
let ben: SignedIn;
let homebody: SignedIn;
let gone: SignedIn;
let crewId: string;
let destinationId: string;
let memoryId: string;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function one(sql: string, params: unknown[] = []): Promise<string> {
  return ((await q<{ id: string }>(sql, params))[0] as { id: string }).id;
}

beforeAll(async () => {
  harness = await startCommandDoors((registry) => {
    registerRecapCommands(registry);
    registerPollCommands(registry);
  });
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  [anna, ben, homebody, gone] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  destinationId = await one(
    "INSERT INTO destinations (slug, name, country, tz) VALUES ('memory-bali', 'Bali', 'ID', 'Asia/Makassar') RETURNING id",
  );
  crewId = await one("INSERT INTO crews (name, created_by) VALUES ('Six', $1) RETURNING id", [
    anna.uid,
  ]);
  for (const person of [anna, ben, homebody, gone]) {
    await q('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      person.uid,
      person === anna ? 'organiser' : 'member',
    ]);
  }
  const tripId = await one(
    `INSERT INTO trips (crew_id, status, destination_id, start_date, end_date)
     VALUES ($1, 'voting', $2, '2025-10-12', '2025-10-19') RETURNING id`,
    [crewId, destinationId],
  );
  for (const status of [
    'won',
    'setup',
    'drafting',
    'draft_review',
    'proposed',
    'confirmed',
    'pre_trip',
    'in_trip',
    'post_trip',
    'archived',
  ]) {
    await q('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
  }
  const recapId = await one(
    `INSERT INTO recaps (trip_id, crew_id, status, version, copy_version, ready_at)
     VALUES ($1, $2, 'ready', 1, 1, now()) RETURNING id`,
    [tripId, crewId],
  );
  for (const person of [anna, ben, gone]) {
    await q('INSERT INTO recap_views (recap_id, trip_id, user_id) VALUES ($1, $2, $3)', [
      recapId,
      tripId,
      person.uid,
    ]);
  }
  await q("UPDATE crew_members SET status = 'left' WHERE crew_id = $1 AND user_id = $2", [
    crewId,
    gone.uid,
  ]);
  memoryId = await one(
    `INSERT INTO memories (trip_id, anchor_kind, anchor_id, text, local_date)
     VALUES ($1, 'anniversary', $2, 'A year ago today: Bali.', '2025-10-15') RETURNING id`,
    [tripId, recapId],
  );
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await harness?.stop();
});

describe('react_memory', () => {
  it('keeps one reaction per traveller, the latest, and pops it in live', async () => {
    const first = await runCommand(harness, anna, 'react_memory', {
      memory_id: memoryId,
      emoji: '❤',
    });
    expect(first.status).toBe(200);
    await runCommand(harness, anna, 'react_memory', { memory_id: memoryId, text: 'again??' });
    await runCommand(harness, gone, 'react_memory', { memory_id: memoryId, emoji: '+1' });
    expect(
      await q(
        'SELECT user_id, emoji, text FROM memory_reactions WHERE memory_id = $1 ORDER BY user_id',
        [memoryId],
      ),
    ).toEqual(
      [
        { user_id: anna.uid, emoji: null, text: 'again??' },
        { user_id: gone.uid, emoji: '+1', text: null },
      ].sort((a, b) => (a.user_id < b.user_id ? -1 : 1)),
    );
    const { rows } = await harness.pool.query<{ type: string }>(
      "SELECT payload->>'type' AS type FROM rt_outbox WHERE channel = $1",
      [`memory:${memoryId}`],
    );
    expect(rows.map((row) => row.type)).toEqual(['reaction', 'reaction', 'reaction']);
    const outsider = await runCommand(harness, homebody, 'react_memory', {
      memory_id: memoryId,
      emoji: '❤',
    });
    expect(outsider.status).toBe(404);
  });
});

describe('start_reunion', () => {
  it("pitches the trip's place into a new destination vote, once", async () => {
    const tripId = generateUuidV7();
    const opId = generateUuidV7();
    const started = await runCommand(
      harness,
      ben,
      'start_reunion',
      { memory_id: memoryId, trip_id: tripId },
      { opId },
    );
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ result: { trip_id: tripId } });
    const replay = await runCommand(
      harness,
      ben,
      'start_reunion',
      { memory_id: memoryId, trip_id: tripId },
      { opId },
    );
    expect(replay.body).toMatchObject({ status: 'duplicate' });
    const polls = await q<{ kind: string; ref_id: string }>(
      `SELECT p.kind, o.ref_id FROM polls p JOIN poll_options o ON o.poll_id = p.id
        WHERE p.trip_id = $1`,
      [tripId],
    );
    expect(polls).toEqual([{ kind: 'destination', ref_id: destinationId }]);
  });

  it('is not for a traveller who left the crew', async () => {
    const result = await runCommand(harness, gone, 'start_reunion', { memory_id: memoryId });
    expect(result.status).toBe(404);
  });
});
