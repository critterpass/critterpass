/**
 * The inbox while a crew agrees on a plan: a sent proposal waits under "needs you" for each
 * recipient until they answer; the organiser holds one card for the latest answer until the trip
 * is locked in; the lock is a quiet entry for everyone going. Real database, the real fan-out.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fanOutEvent } from '../../src/jobs/inbox/fanout';
import { registerProposalInboxFanouts } from '../../src/jobs/proposal/inbox';
import { insertEvent } from '../notify-fixtures';
import { startProposalWorld, type ProposalWorld } from './proposal-world';

let world: ProposalWorld;

interface Item {
  readonly user_id: string;
  readonly kind: string;
  readonly needs_you: boolean;
  readonly open: boolean;
  readonly deep_link: string | null;
  readonly data: Record<string, unknown>;
}

const items = (kind: string) =>
  world.q<Item>(
    `SELECT user_id, kind, needs_you, resolved_at IS NULL AS open, deep_link, data
       FROM inbox_items WHERE trip_id = $1 AND kind = $2 ORDER BY created_at, id`,
    [world.tripId, kind],
  );

async function answers(name: 'Rin' | 'Dev' | 'Alex' | 'Jordan', rsvp: string, actor?: string) {
  const uid = world.users[name];
  await world.q('UPDATE trip_participants SET rsvp = $3 WHERE trip_id = $1 AND user_id = $2', [
    world.tripId,
    uid,
    rsvp,
  ]);
  const eventId = await insertEvent(
    world.harness.pool,
    'rsvp.changed',
    { trip_id: world.tripId, user_id: uid, rsvp },
    { crewId: world.crewId, tripId: world.tripId, actorId: actor ?? uid },
  );
  return fanOutEvent(world.harness.pool, eventId);
}

beforeAll(async () => {
  world = await startProposalWorld();
  registerProposalInboxFanouts();
}, 240_000);

afterAll(async () => {
  await world.stop();
});

describe('the proposal in the inbox', () => {
  it('waits under needs-you for every recipient who has not answered', async () => {
    const eventId = await insertEvent(
      world.harness.pool,
      'proposal.sent',
      { trip_id: world.tripId, proposal_id: world.proposalId, recipients: 5 },
      { crewId: world.crewId, tripId: world.tripId, actorId: world.users.Maya },
    );
    // Sam answered before the plan went out (waiting for a seat): nothing waits for Sam.
    expect(await fanOutEvent(world.harness.pool, eventId)).toMatchObject({ filed: 4 });
    expect(await fanOutEvent(world.harness.pool, eventId)).toMatchObject({ filed: 0 });
    const filed = await items('proposal.received');
    expect(filed.map((item) => item.user_id).sort()).toEqual(
      [world.users.Rin, world.users.Dev, world.users.Alex, world.users.Jordan].sort(),
    );
    expect(filed.every((item) => item.needs_you && item.open)).toBe(true);
    expect(filed[0]).toMatchObject({
      deep_link: `/proposal/${world.proposalId}`,
      data: { proposal_id: world.proposalId, trip_id: world.tripId },
    });
    expect(filed.some((item) => item.user_id === world.users.Maya)).toBe(false);
  });

  it('is settled by the member answering, and tells the organiser who answered', async () => {
    expect(await answers('Rin', 'in')).toMatchObject({ resolved: 1, filed: 1 });
    const received = await items('proposal.received');
    expect(received.find((item) => item.user_id === world.users.Rin)?.open).toBe(false);
    expect(received.filter((item) => item.open)).toHaveLength(3);
    const answered = await items('proposal.answered');
    expect(answered).toHaveLength(1);
    expect(answered[0]).toMatchObject({
      user_id: world.users.Maya,
      needs_you: true,
      open: true,
      deep_link: `/proposal/${world.proposalId}/tracker`,
      data: { user_id: world.users.Rin, rsvp: 'in', answered: 2, recipients: 5 },
    });
  });

  it('keeps one open reply card for the organiser: the newest answer', async () => {
    await answers('Dev', 'out');
    const answered = await items('proposal.answered');
    expect(answered).toHaveLength(2);
    expect(answered.filter((item) => item.open)).toHaveLength(1);
    expect(answered.find((item) => item.open)?.data).toMatchObject({
      user_id: world.users.Dev,
      rsvp: 'out',
    });
  });

  it('files nothing for an answer someone else recorded, but still settles the proposal', async () => {
    // The organiser's lock moves a silent member out: the organiser already knows.
    expect(await answers('Alex', 'out', world.users.Maya)).toMatchObject({ filed: 0 });
    const received = await items('proposal.received');
    expect(received.find((item) => item.user_id === world.users.Alex)?.open).toBe(false);
  });

  it('files the lock for everyone going and settles the reply card', async () => {
    const eventId = await insertEvent(
      world.harness.pool,
      'trip.status_changed',
      { trip_id: world.tripId, from: 'proposed', to: 'confirmed' },
      { crewId: world.crewId, tripId: world.tripId, actorId: world.users.Maya },
    );
    await fanOutEvent(world.harness.pool, eventId);
    const locked = await items('trip.locked');
    // Maya and Rin are in, Jordan never answered and still holds a place; Dev, Alex and Sam do not.
    expect(locked.map((item) => item.user_id).sort()).toEqual(
      [world.users.Maya, world.users.Rin, world.users.Jordan].sort(),
    );
    expect(locked.every((item) => !item.needs_you)).toBe(true);
    expect((await items('proposal.answered')).some((item) => item.open)).toBe(false);
  });

  it('files no lock entry for another status change', async () => {
    const eventId = await insertEvent(
      world.harness.pool,
      'trip.status_changed',
      { trip_id: world.tripId, from: 'confirmed', to: 'pre_trip' },
      { crewId: world.crewId, tripId: world.tripId },
    );
    expect(await fanOutEvent(world.harness.pool, eventId)).toMatchObject({ filed: 0 });
  });
});
