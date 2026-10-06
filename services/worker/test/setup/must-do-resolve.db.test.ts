/**
 * A typed must-do decided once by `ai.fit_check` against a migrated Postgres: our place search
 * finds the place a title names in the trip's destination, the recorded Jev answer picks it and
 * reads its time of day, and both are stored on the row (`poi_id`, `time_of_day`). A title naming
 * no place we have keeps it a wish with its time; a must-do picked from search is never asked; a
 * rerun asks only what still has no place.
 */
import { readFileSync } from 'node:fs';

import { createDecisionClient, templateFitNote } from '@cp/ai';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { checkTripFits } from '../../src/jobs/ai/fit-check';
import { startSetupWorld, type SetupWorld } from './setup-fixture';

let world: SetupWorld;
const ids: Record<string, string> = {};

const FIXTURES: Readonly<Record<string, string>> = {
  'Fushimi Inari at sunrise': 'jev-must-do-fushimi-sunrise',
  'a night walk in Gion': 'jev-must-do-gion-night-walk',
};

const asked: string[] = [];
const send = (_url: unknown, init?: RequestInit) => {
  const body = JSON.parse(init?.body as string) as { state: { must_do: string } };
  asked.push(body.state.must_do);
  const fixture = FIXTURES[body.state.must_do];
  if (fixture === undefined) return Promise.resolve(new Response('{}', { status: 500 }));
  const { response } = JSON.parse(
    readFileSync(new URL(`./fixtures/${fixture}.json`, import.meta.url), 'utf8'),
  ) as { response: { status: number; body: unknown } };
  return Promise.resolve(new Response(JSON.stringify(response.body), { status: response.status }));
};
const decisions = createDecisionClient({ apiKey: 'fixture-key', fetch: send });
const write = (input: Parameters<typeof templateFitNote>[0]) =>
  Promise.resolve(templateFitNote(input));

async function poi(name: string, nameLocal: string | null) {
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO pois (destination_id, name, name_local, category, lat, lng)
     SELECT destination_id, $2, $3, 'temple_shrine', 35, 135 FROM trips WHERE id = $1
     RETURNING id`,
    [world.tripId, name, nameLocal],
  );
  return row?.id as string;
}

async function mustDo(owner: string, title: string, poiId: string | null) {
  const [row] = await world.q<{ id: string }>(
    `INSERT INTO must_dos (trip_id, owner_id, title, poi_id, freeform, priority)
     VALUES ($1, $2, $3, $4, $5, 1) RETURNING id`,
    [world.tripId, owner, title, poiId, poiId === null],
  );
  return row?.id as string;
}

async function row(id: string) {
  const [found] = await world.q<{ poi_id: string | null; time_of_day: string | null }>(
    'SELECT poi_id, time_of_day FROM must_dos WHERE id = $1',
    [id],
  );
  return found;
}

beforeAll(async () => {
  world = await startSetupWorld(3);
  await world.q("UPDATE trips SET status = 'setup' WHERE id = $1", [world.tripId]);
  ids.fushimi = await poi('Fushimi Inari Taisha', '伏見稲荷大社');
  ids.kinkaku = await poi('Kinkaku-ji', '金閣寺');
  const [a, b, c] = world.members as [string, string, string];
  ids.sunrise = await mustDo(a, 'Fushimi Inari at sunrise', null);
  ids.gion = await mustDo(b, 'a night walk in Gion', null);
  ids.picked = await mustDo(c, 'Kinkaku-ji', ids.kinkaku);
}, 180_000);

afterAll(async () => {
  await world?.stop();
});

describe('a typed must-do decided by the fit check', () => {
  it('stores the place it names and its time of day, once', async () => {
    await checkTripFits(world.harness.pool, world.tripId, write, decisions);
    expect(await row(ids.sunrise as string)).toEqual({
      poi_id: ids.fushimi,
      time_of_day: 'early_morning',
    });
    expect(await row(ids.gion as string)).toEqual({ poi_id: null, time_of_day: 'after_dark' });
    expect(await row(ids.picked as string)).toEqual({ poi_id: ids.kinkaku, time_of_day: null });
    expect(asked.sort()).toEqual(['Fushimi Inari at sunrise', 'a night walk in Gion']);
  });

  it('asks again only for the must-do still without a place', async () => {
    asked.length = 0;
    await checkTripFits(world.harness.pool, world.tripId, write, decisions);
    expect(asked).toEqual(['a night walk in Gion']);
    expect(await row(ids.sunrise as string)).toEqual({
      poi_id: ids.fushimi,
      time_of_day: 'early_morning',
    });
  });

  it('leaves a must-do as it was when no decision can be had', async () => {
    const id = await mustDo(world.members[0] as string, 'something we never recorded', null);
    asked.length = 0;
    await checkTripFits(world.harness.pool, world.tripId, write, decisions);
    expect(asked).toContain('something we never recorded');
    expect(await row(id)).toEqual({ poi_id: null, time_of_day: null });
  });
});
