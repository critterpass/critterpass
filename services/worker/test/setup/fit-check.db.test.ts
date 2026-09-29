/**
 * Must-do jobs against a migrated Postgres: `ai.fit_check` gives each must-do the planner's verdict
 * on the trip's dates (fits, tight, clash; unknown without hours), marks what books out or runs a
 * lottery, writes the guide's note (template, and the model's through DeepSeek replayed from a live
 * recording), tells the crew each changed row and changes nothing on a rerun; a tracked lottery's
 * reminder fires once; the must-do prompt reaches its member with the place.
 */
import { readFileSync } from 'node:fs';

import { createGateway, templateFitNote, writeFitNote } from '@cp/ai';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkTripFits } from '../../src/jobs/ai/fit-check';
import { getRegistration, type RoutedEvent } from '../../src/jobs/notify/register';
import { registerSetupPushes } from '../../src/jobs/setup';
import { remindLottery } from '../../src/jobs/setup/lottery-remind';
import { startSetupWorld, type SetupWorld } from './setup-fixture';

let world: SetupWorld;
const ids: Record<string, string> = {};
// Mon 2027-04-05 … Mon 2027-04-12.
const START = '2027-04-05';
const END = '2027-04-12';

const fitFixture = JSON.parse(
  readFileSync(
    new URL('../../../../packages/ai/test/fixtures/deepseek/fit-02.json', import.meta.url),
    'utf8',
  ),
) as { response: { status: number; body: unknown } };

const every = (start: string, end: string) => ({
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, [{ start, end }]]),
  ),
});

async function poi(name: string, hours: unknown, tags: string[] = [], minutes?: number) {
  const [destination] = await world.q<{ destination_id: string }>(
    'SELECT destination_id FROM trips WHERE id = $1',
    [world.tripId],
  );
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng, hours, tags, editorial)
     VALUES ($1, $2, 'temple_shrine', 35, 135, $3, $4, $5) RETURNING id`,
    [
      destination?.destination_id,
      name,
      JSON.stringify(hours),
      tags,
      JSON.stringify(minutes === undefined ? {} : { time_needed_min: minutes }),
    ],
  );
  return row?.id as string;
}

async function mustDo(owner: string, title: string, poiId: string | null, priority = 0) {
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO must_dos (trip_id, owner_id, title, poi_id, freeform, priority)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [world.tripId, owner, title, poiId, poiId === null, priority],
  );
  return row?.id as string;
}

async function state(id: string) {
  const [row] = await world.q<{
    fit_status: string;
    fit_note: string | null;
    external_action: string;
    external_deadline: string | null;
  }>(
    `SELECT fit_status, fit_note, external_action, external_deadline::text AS external_deadline
       FROM must_dos WHERE id = $1`,
    [id],
  );
  return row;
}

beforeAll(async () => {
  world = await startSetupWorld(4);
  registerSetupPushes();
  await world.q("UPDATE trips SET status = 'setup', start_date = $2, end_date = $3 WHERE id = $1", [
    world.tripId,
    START,
    END,
  ]);
  const [a, b, c, d] = world.members as [string, string, string, string];
  ids.inari = await mustDo(a, 'Fushimi Inari', await poi('Fushimi Inari', every('00:00', '24:00')));
  ids.kinkaku = await mustDo(
    b,
    'Kinkaku-ji',
    await poi('Kinkaku-ji', { weekly: { mo: [{ start: '09:00', end: '12:30' }] } }, [], 120),
  );
  ids.closed = await mustDo(
    c,
    'Moss Temple',
    await poi('Moss Temple', { weekly: { mo: [{ start: '09:00', end: '09:30' }] } }, [], 120),
  );
  ids.freeform = await mustDo(d, 'Eat the best ramen', null);
  ids.ghibli = await mustDo(
    a,
    'Ghibli Museum',
    await poi('Ghibli Museum', every('10:00', '18:00'), ['book_ahead:30']),
    1,
  );
  ids.lottery = await mustDo(
    b,
    'Sumo tickets',
    await poi('Sumo Hall', every('08:00', '18:00'), ['lottery']),
    1,
  );
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('ai.fit_check', () => {
  it('judges each must-do on the dates and writes the guide’s note', async () => {
    const outcome = await checkTripFits(world.harness.pool, world.tripId, (input) =>
      Promise.resolve(templateFitNote(input)),
    );
    expect(outcome).toEqual({ checked: 6, changed: 5 });
    expect(await state(ids.inari!)).toMatchObject({ fit_status: 'fits', external_action: 'none' });
    expect((await state(ids.kinkaku!))?.fit_status).toBe('tight');
    expect(await state(ids.closed!)).toMatchObject({
      fit_status: 'clash',
      fit_note: 'Moss Temple is closed on your dates.',
    });
    expect(await state(ids.freeform!)).toMatchObject({ fit_status: 'unknown', fit_note: null });
    expect(await state(ids.ghibli!)).toMatchObject({
      external_action: 'book_ahead',
      external_deadline: '2027-03-06',
    });
    expect((await state(ids.lottery!))?.external_action).toBe('lottery');
    const hints = await world.q<{ payload: { type: string } }>(
      "SELECT payload FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'must_do.row'",
      [`trip_setup:${world.tripId}`],
    );
    expect(hints).toHaveLength(5);
    expect(
      await checkTripFits(world.harness.pool, world.tripId, () => Promise.reject(new Error('no'))),
    ).toEqual({ checked: 6, changed: 0 });
  });

  it('takes the guide’s own words from the model when it answers', async () => {
    await world.q("UPDATE must_dos SET fit_status = 'unknown', fit_note = NULL WHERE id = $1", [
      ids.kinkaku,
    ]);
    const gateway = createGateway({
      apiKey: 'replay',
      maxAttempts: 1,
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify(fitFixture.response.body), {
            status: fitFixture.response.status,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    });
    await checkTripFits(world.harness.pool, world.tripId, (input) => writeFitNote(gateway, input));
    expect((await state(ids.kinkaku!))?.fit_note).toBe(
      'Kinkaku-ji fits, but the free stretch is short, so go early.',
    );
  });
});

describe('must-do reminders and prompts', () => {
  it('reminds a tracked lottery once', async () => {
    const owner = world.members[1] as string;
    await world.q(
      `INSERT INTO reminders (user_id, target_kind, target_id, fire_at, condition)
       VALUES ($1, 'must_do', $2, now(), '{"slot":"deadline"}')`,
      [owner, ids.lottery],
    );
    await world.q("UPDATE must_dos SET external_deadline = '2027-03-01' WHERE id = $1", [
      ids.lottery,
    ]);
    const timer = { ref_id: ids.lottery!, data: { user_id: owner, slot: 'deadline' } };
    expect(await remindLottery(world.harness.pool, timer)).toBe('reminded');
    expect(await remindLottery(world.harness.pool, timer)).toBe('gone');
    const [event] = await world.q<{ id: string; payload: Record<string, unknown> }>(
      "SELECT id, payload FROM domain_events WHERE type = 'lottery.reminder_due'",
    );
    const routed: RoutedEvent = {
      id: event!.id,
      type: 'lottery.reminder_due',
      payload: event!.payload,
      crewId: world.crewId,
      tripId: world.tripId,
      actorId: null,
      occurredAt: new Date(),
    };
    const push = await withSystem(world.harness.pool, (tx) =>
      getRegistration('lottery.reminder_due', 'lottery_deadline')!.compose(tx, routed, owner),
    );
    expect(push?.body.id).toBe('notifications.setup.lottery.deadline');
    expect(push?.vars).toMatchObject({ title: 'Sumo tickets', date: 'Mar 1' });
  });

  it('asks each member for their one thing, naming the place', async () => {
    const uid = world.members[3] as string;
    const routed: RoutedEvent = {
      id: '0199a0f2-7c1e-7d4b-9a53-2f3c1d0e9b11',
      type: 'must_do.prompted',
      payload: { trip_id: world.tripId, user_id: uid },
      crewId: world.crewId,
      tripId: world.tripId,
      actorId: null,
      occurredAt: new Date(),
    };
    const registration = getRegistration('must_do.prompted', 'setup_task')!;
    expect(await withSystem(world.harness.pool, (tx) => registration.audience(tx, routed))).toEqual(
      [uid],
    );
    const push = await withSystem(world.harness.pool, (tx) =>
      registration.compose(tx, routed, uid),
    );
    expect(push?.vars).toMatchObject({ name: 'Member3', place: 'Kyoto' });
    expect(push?.deepLink).toBe(`/trip/${world.tripId}/setup/must-dos/add`);
  });
});
