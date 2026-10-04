/**
 * An organiser's private ask about one member's saves, delivered: the push and the inbox row go to
 * the asked member only, name who asked and nothing else (no place, no idea, no balance), and
 * nothing is sent for an ask that was already answered.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fanOutEvent } from '../../src/jobs/inbox/fanout';
import { getRegistration, type RoutedEvent } from '../../src/jobs/notify/register';
import { registerMemberAskDelivery } from '../../src/jobs/planning/asks';
import {
  insertCrew,
  insertEvent,
  insertUser,
  startNotifyDb,
  type NotifyDb,
} from '../notify-fixtures';

let db: NotifyDb;
let organiser: string;
let dev: string;
let maya: string;
let crewId: string;
let tripId: string;
let ideaId: string;

const PLACE = 'Seniman Coffee';

async function ask(status = 'open'): Promise<{ askId: string; event: RoutedEvent }> {
  const askId = randomUUID();
  await db.pool.query(
    `INSERT INTO member_asks (id, trip_id, asked_by, member_id, idea_ids, ops, status)
     VALUES ($1, $2, $3, $4, $5::uuid[], $6, $7)`,
    [askId, tripId, organiser, dev, [ideaId], JSON.stringify([{ reason: PLACE }]), status],
  );
  const payload = { trip_id: tripId, ask_id: askId, asker_id: organiser, member_id: dev };
  const id = await insertEvent(db.pool, 'check.member_asked', payload, {
    crewId,
    tripId,
    actorId: organiser,
  });
  return {
    askId,
    event: {
      id,
      type: 'check.member_asked',
      payload,
      crewId,
      tripId,
      actorId: organiser,
      occurredAt: new Date(),
    },
  };
}

const withClient = async <T>(run: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
  const client = await db.pool.connect();
  try {
    return await run(client);
  } finally {
    client.release();
  }
};

beforeAll(async () => {
  db = await startNotifyDb();
  registerMemberAskDelivery();
  [organiser, dev, maya] = [
    await insertUser(db.pool),
    await insertUser(db.pool),
    await insertUser(db.pool),
  ];
  await db.pool.query("UPDATE users SET display_name = 'Winston Lee' WHERE id = $1", [organiser]);
  crewId = await insertCrew(db.pool, [organiser, dev, maya]);
  const trip = await db.pool.query<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'setup') RETURNING id",
    [crewId],
  );
  tripId = trip.rows[0]!.id;
  const idea = await db.pool.query<{ id: string }>(
    `INSERT INTO trip_ideas (trip_id, name, category, lat, lng, backer_ids, sources)
     VALUES ($1, $2, 'food', -8.5, 115.26, $3, '{save}') RETURNING id`,
    [tripId, PLACE, [dev]],
  );
  ideaId = idea.rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('the private ask, delivered', () => {
  it('pushes the asked member only, naming who asked and nothing about the saves', async () => {
    const { askId, event } = await ask();
    const registration = getRegistration('check.member_asked', 'check_ask_member');
    if (registration === undefined) throw new Error('the ask push is registered');
    expect(await withClient((c) => registration.audience(c, event))).toEqual([dev]);
    const composed = await withClient((c) => registration.compose(c, event, dev));
    expect(composed).toMatchObject({
      body: { id: 'notifications.check.ask_member.body' },
      vars: { crew: 'Bali crew', asker: 'Winston' },
      deepLink: `/trip/${tripId}/check`,
      ctx: { ask_id: askId },
    });
    expect(Object.keys(composed?.vars ?? {}).sort()).toEqual(['asker', 'crew']);
    const text = JSON.stringify(composed);
    expect(text).not.toContain(PLACE);
    expect(text).not.toContain(ideaId);
    expect(await withClient((c) => registration.compose(c, event, maya))).toBeNull();
  });

  it('files one inbox row with yes and no, for the asked member only', async () => {
    const { askId, event } = await ask();
    expect(await fanOutEvent(db.pool, event.id)).toMatchObject({ filed: 1 });
    const { rows } = await db.pool.query<{ user_id: string; data: unknown; actions: unknown }>(
      "SELECT user_id, data, actions FROM inbox_items WHERE kind = 'check.member_ask' AND data->>'ask_id' = $1",
      [askId],
    );
    expect(rows.map((row) => row.user_id)).toEqual([dev]);
    expect(rows[0]?.data).toEqual({ ask_id: askId });
    expect(rows[0]?.actions).toEqual([
      expect.objectContaining({
        id: 'yes',
        command: 'answer_member_ask',
        payload: { ask_id: askId, accept: true },
      }),
      expect.objectContaining({
        id: 'no',
        command: 'answer_member_ask',
        payload: { ask_id: askId, accept: false },
      }),
    ]);
    expect(JSON.stringify(rows)).not.toContain(PLACE);
  });

  it('sends nothing for an ask already answered', async () => {
    const { event } = await ask('declined');
    const registration = getRegistration('check.member_asked', 'check_ask_member');
    expect(await withClient((c) => registration!.compose(c, event, dev))).toBeNull();
    expect(await fanOutEvent(db.pool, event.id)).toMatchObject({ filed: 0 });
  });
});
