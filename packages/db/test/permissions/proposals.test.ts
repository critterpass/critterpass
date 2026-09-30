/**
 * `proposals` (C1, RLS T): the crew reads a proposal once it is sent; before that only its
 * organisers do (draft privacy). Nobody writes through app_user: commands write as the system.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { insertTrip, insertTripParticipant } from '../helpers/actors';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let draftTripId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { actors, crewId } = harness.fixture;
  draftTripId = await withSystem(harness.db.pool, async (tx) => {
    const trip = await insertTrip(tx, { crewId });
    await insertTripParticipant(tx, { tripId: trip, userId: actors.organiser, role: 'organiser' });
    await insertTripParticipant(tx, { tripId: trip, userId: actors.member, rsvp: 'in' });
    await tx.query(
      `INSERT INTO proposals (trip_id, created_by, reply_by) VALUES ($1, $2, now() + interval '5 days')`,
      [trip, actors.organiser],
    );
    return trip;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const probe = 'SELECT 1 FROM proposals WHERE trip_id = $1';

describe('proposals', () => {
  it('shows a sent proposal to the crew and nobody outside it', async () => {
    const { actors, tripId } = harness.fixture;
    for (const kind of ['member', 'organiser', 'coOrganiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(1);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
  });

  it('keeps an unsent proposal to its organisers', async () => {
    const { actors } = harness.fixture;
    expect(await visibleRows(harness, actors.organiser, probe, [draftTripId])).toBe(1);
    expect(await visibleRows(harness, actors.member, probe, [draftTripId])).toBe(0);
  });

  it('is never written by app_user, not even by the organiser', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query("UPDATE proposals SET format = 'poster' WHERE trip_id = $1", [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('syncs sent proposals on the trip stream and unsent ones to organisers only', async () => {
    const { tripId } = harness.fixture;
    const crew = await harness.rows('trip', 'member', { trip_id: tripId });
    expect(crew.get('proposals')).toHaveLength(1);
    const unsent = await harness.rows('trip', 'member', { trip_id: draftTripId });
    expect(unsent.get('proposals') ?? []).toHaveLength(0);
    const drafts = await harness.rows('trip_draft', 'organiser', { trip_id: draftTripId });
    expect(drafts.get('proposals')).toHaveLength(1);
    const memberDrafts = await harness.rows('trip_draft', 'member', { trip_id: draftTripId });
    expect(memberDrafts.get('proposals') ?? []).toHaveLength(0);
  });
});
