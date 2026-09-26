/**
 * `appendDomainEvent`/`enqueueRealtime` (packages/db/src/events.ts): domain event + activity
 * projection + registered hooks land atomically with the rest of the command's writes, and
 * `app.enqueue_rt` only lets a caller publish to a channel they could subscribe to.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  appendDomainEvent,
  type AppendedDomainEvent,
  enqueueRealtime,
  onEventAppended,
  resetEventAppendedHooksForTests,
} from '../src/events';
import { withSystem, withUser } from '../src/tx';
import { anonymousActor } from './helpers/actors';
import { startDbTestContainer, type DbTestContainer, type DbTestDatabase } from './helpers/pg-container';
import { buildTripFixture, type TripFixture } from './helpers/trip-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: TripFixture;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildTripFixture(db.pool);
}, 180_000);

afterEach(() => {
  resetEventAppendedHooksForTests();
});

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('appendDomainEvent', () => {
  it('writes a domain_events row and its activity projection in the same call', async () => {
    const appended = await withUser(db.pool, fixture.organiserId, anonymousActor().device, (tx) =>
      appendDomainEvent(tx, {
        type: 'trip.status_changed',
        aggregateKind: 'trip',
        aggregateId: fixture.tripId,
        actorKind: 'user',
        actorId: fixture.organiserId,
        payload: { trip_id: fixture.tripId, from: 'voting', to: 'won' },
        crewId: fixture.crewId,
        tripId: fixture.tripId,
      }),
    );

    // domain_events has no app_user or app_system grant at all (only app.append_event, via owner
    // privilege, writes it), so this reads through the raw pool connection (app_owner) instead.
    const event = await db.pool.query<{ type: string }>('SELECT type FROM domain_events WHERE id = $1', [
      appended.id,
    ]);
    const activity = await withSystem(db.pool, (tx) =>
      tx.query<{ verb: string; text: string }>('SELECT verb, text FROM activity_events WHERE trip_id = $1', [
        fixture.tripId,
      ]),
    );

    expect(event.rows).toEqual([{ type: 'trip.status_changed' }]);
    expect(activity.rows).toEqual([{ verb: 'moved', text: 'activity.trip_status_changed' }]);
  });

  it('runs every registered onEventAppended hook in the same transaction', async () => {
    const seen: AppendedDomainEvent[] = [];
    onEventAppended(async (_tx, event) => {
      seen.push(event);
      await Promise.resolve();
    });

    await withUser(db.pool, fixture.memberId, anonymousActor().device, (tx) =>
      appendDomainEvent(tx, {
        type: 'rsvp.changed',
        aggregateKind: 'trip_participant',
        aggregateId: fixture.tripId,
        actorKind: 'user',
        actorId: fixture.memberId,
        payload: { trip_id: fixture.tripId, user_id: fixture.memberId, rsvp: 'in' },
        crewId: fixture.crewId,
        tripId: fixture.tripId,
      }),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ type: 'rsvp.changed', tripId: fixture.tripId });
  });

  it('rolls back the event, activity row and outbox rows together with the rest of the tx', async () => {
    const isolated = await container.createDatabase();
    try {
      const fx = await buildTripFixture(isolated.pool);
      await expect(
        withUser(isolated.pool, fx.organiserId, anonymousActor().device, async (tx) => {
          await appendDomainEvent(tx, {
            type: 'trip.status_changed',
            aggregateKind: 'trip',
            aggregateId: fx.tripId,
            actorKind: 'user',
            actorId: fx.organiserId,
            payload: { trip_id: fx.tripId, from: 'voting', to: 'won' },
            crewId: fx.crewId,
            tripId: fx.tripId,
          });
          await enqueueRealtime(tx, { channel: `trip:${fx.tripId}`, payload: { hint: true } });
          throw new Error('boom: simulate a later step in the same command failing');
        }),
      ).rejects.toThrow('boom');

      // domain_events/cmd_log have no app_user or app_system grant at all (SECURITY DEFINER
      // functions write them via owner privilege), so verifying "nothing was written" queries the
      // raw pool connection (app_owner, per test/helpers/containers.ts) rather than either role.
      const events = await isolated.pool.query('SELECT 1 FROM domain_events');
      const activity = await isolated.pool.query('SELECT 1 FROM activity_events');
      const outbox = await isolated.pool.query('SELECT 1 FROM rt_outbox');
      expect({
        events: events.rowCount ?? 0,
        activity: activity.rowCount ?? 0,
        outbox: outbox.rowCount ?? 0,
      }).toEqual({ events: 0, activity: 0, outbox: 0 });
    } finally {
      await isolated.drop();
    }
  });
});

describe('enqueueRealtime', () => {
  it('lets a caller publish to their own user channel', async () => {
    const { id } = await withUser(db.pool, fixture.memberId, anonymousActor().device, (tx) =>
      enqueueRealtime(tx, { channel: `user:#${fixture.memberId}`, payload: { hint: 1 } }),
    );
    expect(id).toBeDefined();
  });

  it('lets a crew member publish to their own crew channel', async () => {
    await expect(
      withUser(db.pool, fixture.memberId, anonymousActor().device, (tx) =>
        enqueueRealtime(tx, { channel: `crew:${fixture.crewId}`, payload: { hint: 1 } }),
      ),
    ).resolves.toBeDefined();
  });

  it('rejects publishing to a crew channel the caller does not belong to', async () => {
    await expect(
      withUser(db.pool, fixture.outsiderId, anonymousActor().device, (tx) =>
        enqueueRealtime(tx, { channel: `crew:${fixture.crewId}`, payload: { hint: 1 } }),
      ),
    ).rejects.toThrow(/not permitted to publish/i);
  });

  it('rejects an app_user enqueueing an unsubscribe (system/trigger only)', async () => {
    await expect(
      withUser(db.pool, fixture.memberId, anonymousActor().device, (tx) =>
        enqueueRealtime(tx, { channel: `crew:${fixture.crewId}`, payload: {}, kind: 'unsubscribe' }),
      ),
    ).rejects.toThrow(/only app_system or a trigger/i);
  });

  it('lets app_system enqueue an unsubscribe directly', async () => {
    await expect(
      withSystem(db.pool, (tx) =>
        enqueueRealtime(tx, { channel: `crew:${fixture.crewId}`, payload: {}, kind: 'unsubscribe' }),
      ),
    ).resolves.toBeDefined();
  });
});
