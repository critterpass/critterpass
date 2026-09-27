/**
 * Domain events appended by an api command reach the notification router: the api's send-only
 * pg-boss enqueues `notify.route` in the command's own transaction, one job per triggered key,
 * so an applied command leaves exactly the routing job behind and a rejected one leaves none.
 */
import { randomUUID } from 'node:crypto';

import { emitEvent, resetEventAppendedHooksForTests, resetJobProducerForTests } from '@cp/db';
import {
  DomainError,
  registerNotificationTrigger,
  resetNotificationTriggersForTests,
} from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineCommand } from '../../src/commands/_framework/define-command';
import { routeNotificationsFromApiEvents, startJobProducer } from '../../src/jobs/producer';
import { startActionDoors, type ActionDoorsHarness } from './action-doors-harness';
import { envelope } from './command-doors-harness';

let harness: ActionDoorsHarness;
let producer: PgBoss;

const joinPayload = z.object({ crew_id: z.uuid(), reject: z.boolean() });

beforeAll(async () => {
  harness = await startActionDoors();
  producer = await startJobProducer({
    connectionString: harness.connectionString,
    logger: { error: () => undefined },
  });
  resetEventAppendedHooksForTests();
  routeNotificationsFromApiEvents();
  resetNotificationTriggersForTests();
  registerNotificationTrigger('crew.member_joined', 'member_joined');

  // Stands in for a crew command: appends its domain event inside the command transaction.
  harness.registry.register(
    defineCommand({
      name: 'join_test_crew',
      v: 1,
      schema: joinPayload,
      offline: false,
      allowAnonymous: true,
      authorize: () => Promise.resolve(),
      handle: async (tx, payload, ctx) => {
        const event = await emitEvent(tx, {
          type: 'crew.member_joined',
          aggregateKind: 'crew',
          aggregateId: payload.crew_id,
          actorKind: 'user',
          actorId: ctx.uid,
          crewId: payload.crew_id,
          payload: { crew_id: payload.crew_id, user_id: ctx.uid },
        });
        if (payload.reject) throw new DomainError('STATE_INVALID', { state: 'closed' });
        return { event_id: event.id };
      },
    }),
  );
  harness.registry.register(
    defineCommand({
      name: 'start_test_trip',
      v: 1,
      schema: z.object({ trip_id: z.uuid(), crew_id: z.uuid() }),
      offline: false,
      allowAnonymous: true,
      authorize: () => Promise.resolve(),
      handle: async (tx, payload, ctx) => {
        const event = await emitEvent(tx, {
          type: 'trip.created',
          aggregateKind: 'trip',
          aggregateId: payload.trip_id,
          actorKind: 'user',
          actorId: ctx.uid,
          crewId: payload.crew_id,
          payload: { trip_id: payload.trip_id, crew_id: payload.crew_id },
        });
        return { event_id: event.id };
      },
    }),
  );
}, 240_000);

afterAll(async () => {
  resetEventAppendedHooksForTests();
  resetJobProducerForTests();
  resetNotificationTriggersForTests();
  await producer.stop({ graceful: false });
  await harness.stop();
});

async function run(cmd: string, payload: Record<string, unknown>): Promise<Response> {
  const session = await harness.signInAnonymously();
  return harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(envelope(cmd, payload)),
  });
}

async function routingJobs(): Promise<{ singleton_key: string; data: unknown }[]> {
  const { rows } = await harness.pool.query<{ singleton_key: string; data: unknown }>(
    "SELECT singleton_key, data FROM pgboss.job WHERE name = 'notify.route' ORDER BY created_on",
  );
  return rows;
}

describe('api-appended domain events', () => {
  it('enqueue notify.route in the command transaction, one job per triggered key', async () => {
    const response = await run('join_test_crew', { crew_id: randomUUID(), reject: false });
    expect(response.status).toBe(200);
    const { result } = (await response.json()) as { result: { event_id: string } };

    expect(await routingJobs()).toContainEqual({
      singleton_key: `${result.event_id}:member_joined:*`,
      data: { event_id: result.event_id, key: 'member_joined' },
    });
  });

  it('leave no routing job behind when the command is rejected', async () => {
    const before = (await routingJobs()).length;
    const response = await run('join_test_crew', { crew_id: randomUUID(), reject: true });
    expect(response.status).toBe(409);
    expect(await routingJobs()).toHaveLength(before);
  });

  it('enqueue nothing for an event no notification is triggered by', async () => {
    const before = (await routingJobs()).length;
    const response = await run('start_test_trip', { trip_id: randomUUID(), crew_id: randomUUID() });
    expect(response.status).toBe(200);
    expect(await routingJobs()).toHaveLength(before);
  });
});
