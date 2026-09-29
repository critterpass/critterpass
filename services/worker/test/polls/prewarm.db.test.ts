/**
 * The pitch prewarm: the deck is the crews' queued pitches and places back in the deck this month;
 * a place whose pitch is still fresh for its fares is left alone, and without a model key the job
 * writes nothing. The deck also feeds the Home tip scan.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { deckPlaces, prewarmPitches, registerPitchTipCandidates } from '../../src/jobs/pitches';
import { tipCandidates } from '../../src/jobs/tips/detect';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

const NOW = new Date('2026-10-20T08:00:00Z');

let harness: JobsHarness;
let crewId: string;
let place: string;

beforeAll(async () => {
  harness = await startJobsHarness();
  registerPitchTipCandidates();
  const uid = randomUUID();
  await harness.pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [uid]);
  const crew = await harness.pool.query<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Deck', $1) RETURNING id",
    [uid],
  );
  crewId = crew.rows[0]!.id;
  await harness.pool.query(
    "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser')",
    [crewId, uid],
  );
  const destination = await harness.pool.query<{ id: string }>(
    "INSERT INTO destinations (slug, name, coverage) VALUES ('deck-porto', 'Porto', 'guest') RETURNING id",
  );
  place = destination.rows[0]!.id;
  await harness.pool.query(
    `INSERT INTO pitches (crew_id, destination_id, cache_key, status, updated_at)
     VALUES ($1, $2, 'k', 'queued', $3), ($1, $2, 'k2', 'back_in_deck', $3 - interval '60 days')`,
    [crewId, place, NOW],
  );
}, 240_000);

afterAll(async () => {
  await harness.close();
});

describe('pitch prewarm', () => {
  it('finds the deck and feeds the tip scan', async () => {
    const deck = await withSystem(harness.pool, (tx) => deckPlaces(tx, NOW));
    expect(deck).toEqual([{ crewId, placeId: place }]);
    const candidates = await withSystem(harness.pool, (tx) => tipCandidates(tx, crewId));
    expect(candidates).toContainEqual({ placeId: place, place: 'Porto' });
  });

  it('writes nothing without a model', async () => {
    expect(await prewarmPitches(harness.pool, undefined, NOW)).toEqual({ written: 0, fresh: 0 });
  });
});
