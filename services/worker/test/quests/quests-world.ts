/**
 * The critter world's Da Nang crew of four on a trip under way, plus today's plan on the trip's
 * clock with the places of the recorded quest eval case `quests-01` (Ba Na Hills 07:30, My Khe
 * Beach 16:00, Han Market 19:00, the same POI and plan item ids), one traveller sharing visits, the
 * quest queues and the quest runtime (templates, XP handler, pushes and the event hook).
 */
import { randomUUID } from 'node:crypto';

import { appendDomainEvent, withSystem } from '@cp/db';
import { localSchedule, QUEST_QUEUES, toLocalWallTime } from '@cp/domain';

import { registerQuestRuntime } from '../../src/jobs/quests';
import { startCritterWorld, type CritterWorld } from '../critters/critters-world';

export const TZ = 'Asia/Ho_Chi_Minh';
export const PLACES = {
  bana: '0199a0f2-0000-7000-8000-00000000d001',
  mykhe: '0199a0f2-0000-7000-8000-00000000d003',
  han: '0199a0f2-0000-7000-8000-00000000d004',
} as const;
export const ITEMS = {
  bana: '0199a0f2-0000-7000-8000-000000001001',
  mykhe: '0199a0f2-0000-7000-8000-000000001002',
  han: '0199a0f2-0000-7000-8000-000000001003',
} as const;

export interface QuestWorld extends CritterWorld {
  readonly today: string;
  /** A local wall time today as an instant. */
  at(time: string): Date;
  visit(uid: string, poi: string, at: Date): Promise<string>;
  event(type: string, payload: Record<string, unknown>, crewId?: string | null): Promise<string>;
}

export async function startQuestWorld(): Promise<QuestWorld> {
  const world = await startCritterWorld(4);
  registerQuestRuntime();
  for (const queue of Object.values(QUEST_QUEUES)) {
    if ((await world.boss.getQueue(queue)) === null) {
      await world.boss.createQueue(queue, { policy: 'exclusive' });
    }
  }
  const today = toLocalWallTime(new Date(), TZ).date;
  const at = (time: string) => localSchedule({ date: today, time, tz: TZ });
  const destination = world.ids['destination'];
  for (const [key, id] of Object.entries(PLACES)) {
    const name = { bana: 'Ba Na Hills', mykhe: 'My Khe Beach', han: 'Han Market' }[key];
    await world.q(
      "INSERT INTO pois (id, destination_id, name, category, lat, lng) VALUES ($1, $2, $3, 'other', 16, 108)",
      [id, destination, name],
    );
  }
  const [version] = await world.q<{ id: string }>(
    "INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current') RETURNING id",
    [world.tripId],
  );
  const [day] = await world.q<{ id: string }>(
    'INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, $3) RETURNING id',
    [version?.id, world.tripId, today],
  );
  for (const [key, time] of [
    ['bana', '07:30'],
    ['mykhe', '16:00'],
    ['han', '19:00'],
  ] as const) {
    await world.q(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, tz, poi_id, category, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'sight', 'confirmed')`,
      [version?.id, day?.id, world.tripId, ITEMS[key], at(time), TZ, PLACES[key]],
    );
  }
  await world.q('UPDATE trips SET current_version_id = $2 WHERE id = $1', [
    world.tripId,
    version?.id,
  ]);
  await world.q(
    "INSERT INTO consents (user_id, purpose, granted_at) VALUES ($1, 'visit_detection', now())",
    [world.members[0]],
  );
  return {
    ...world,
    today,
    at,
    async visit(uid, poi, arrived) {
      const id = randomUUID();
      await world.q(
        `INSERT INTO visits (id, user_id, trip_id, poi_id, source, arrived_at)
         VALUES ($1, $2, $3, $4, 'geofence', $5)`,
        [id, uid, world.tripId, poi, arrived],
      );
      return id;
    },
    event(type, payload, crewId = world.crewId) {
      return withSystem(world.harness.pool, async (tx) => {
        const appended = await appendDomainEvent(tx, {
          type: type as never,
          aggregateKind: 'test',
          aggregateId: randomUUID(),
          actorKind: 'system',
          actorId: null,
          crewId,
          tripId: world.tripId,
          payload,
        });
        return appended.id;
      });
    },
  };
}
