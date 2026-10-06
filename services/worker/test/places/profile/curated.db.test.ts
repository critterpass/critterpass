/**
 * Typing curated places from their reviewed notes on a migrated Postgres, with the network replayed
 * at its edge: live recordings of Jev's labels for Bánh Căn Nhà Chung and Crazy House in Đà Lạt
 * (read with their notes), and of DeepSeek reading the eatery's note for its dish. The rows hold
 * typed fields only and leave the note alone; a web profile is never touched; the profile job
 * still passes the places over, and counts a typed row as no profile once a note is gone.
 */
import { readFileSync } from 'node:fs';

import { createDecisionClient, createGateway } from '@cp/ai';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { typeCuratedPlaces } from '../../../src/places/profile/curated-run';
import { skipReason } from '../../../src/places/profile/run';
import { loadProfileTarget, spentTodayMicros } from '../../../src/places/profile/store';
import { warmPlaces } from '../../../src/places/profile/warm';
import { startJobsHarness, type JobsHarness } from '../../helpers/jobs-harness';

const FIXTURES = new URL('./fixtures/', import.meta.url);
const recorded = (name: string) =>
  (
    JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8')) as {
      response: { status: number; body: unknown };
    }
  ).response;

let harness: JobsHarness;
let destinationId: string;
let eatery: string;
let house: string;
let profiled: string;
let failed: string;

const EATERY_NOTE = {
  why_go: 'Eat bánh căn, mini rice pancakes, near Nhà Chung Street.',
  best_time: 'Breakfast or midday',
  crowd_hint: 'Small and often busy',
  time_needed_min: 30,
};
const HOUSE_NOTE = {
  why_go: 'Explore the surreal architecture of this famous Dalat building.',
  best_time: 'Early morning before tour groups',
  crowd_hint: 'Popular, expect queues',
  time_needed_min: 60,
};

function network() {
  const calls: string[] = [];
  const send = (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = input instanceof Request ? input.url : String(input);
    const body = typeof init?.body === 'string' ? init.body : '';
    const json = (name: string) => {
      calls.push(name);
      const { status, body: reply } = recorded(name);
      return Promise.resolve(
        new Response(JSON.stringify(reply), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
    if (url.includes('typesafe.ai')) {
      return json(
        body.includes('Crazy House') ? 'jev-curated-sight-labels' : 'jev-curated-food-labels',
      );
    }
    if (url.includes('deepseek.com')) return json('deepseek-curated-dish');
    return Promise.resolve(new Response('not found', { status: 404 }));
  };
  const gateway = createGateway({
    apiKey: 'fixture-key',
    fetch: send,
    maxAttempts: 1,
  });
  const decisions = createDecisionClient({
    apiKey: 'fixture-key',
    fetch: send,
    gateway,
  });
  return { deps: { gateway, decisions }, calls };
}

async function place(name: string, nameLocal: string | null, category: string, note: object) {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, name_local, category, lat, lng, tags, editorial)
     VALUES ($1, $2, $3, $4, 11.94, 108.43, $5, $6) RETURNING id`,
    [destinationId, name, nameLocal, category, ['local_life'], JSON.stringify(note)],
  );
  return rows[0]?.id as string;
}

const row = (poiId: string) =>
  withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<Record<string, unknown>>(
      'SELECT * FROM place_profiles WHERE poi_id = $1',
      [poiId],
    );
    return rows[0];
  });

beforeAll(async () => {
  harness = await startJobsHarness();
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, coverage, tz)
     VALUES ('vn-da-lat', 'Đà Lạt', 'VN', 'guest', 'Asia/Ho_Chi_Minh') RETURNING id`,
  );
  destinationId = rows[0]?.id as string;
  eatery = await place('Bánh Căn Nhà Chung', null, 'food', EATERY_NOTE);
  house = await place('Crazy House', 'Biệt thự Hằng Nga', 'museum', HOUSE_NOTE);
  profiled = await place('Dalat Market', 'Chợ Đà Lạt', 'market', { why_go: 'A reviewed line.' });
  failed = await place('Crazy House annex', null, 'museum', HOUSE_NOTE);
  await place('Đà Lạt Station', null, 'transit', { why_go: 'Trains to Trại Mát.' });
  await harness.pool.query(
    `INSERT INTO place_profiles (poi_id, status, basis, texts, best_times, visit_min)
     VALUES ($1, 'ready', 'web', '{"en": {"why_go": "From the web."}}', '{morning}', 90),
            ($2, 'failed', 'web', '{}', '{}', NULL)`,
    [profiled, failed],
  );
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

describe('typing curated places from their notes', { timeout: 60_000 }, () => {
  it('stores typed fields only, leaves the notes and web profiles alone', async () => {
    const net = network();
    const report = await typeCuratedPlaces(harness.pool, net.deps, { force: false });
    // The transit stop gets its kind's facts; the web profile is not loaded at all.
    expect(report).toMatchObject({ places: 3, typed: 3, failed: 0, kept: 0, withDish: 1 });
    // Only the eatery's note is read for a dish.
    expect(net.calls.filter((c) => c === 'deepseek-curated-dish')).toHaveLength(1);

    expect(await row(eatery)).toMatchObject({
      status: 'ready',
      basis: 'reviewed_note',
      texts: {},
      facts: [],
      photos: [],
      category: 'food',
      meal_role: 'meal',
      best_times: ['early_morning', 'morning', 'midday'],
      visit_min: 30,
      dish: 'bánh căn',
      model: 'jev',
    });
    expect(await row(house)).toMatchObject({
      basis: 'reviewed_note',
      meal_role: null,
      best_times: ['early_morning', 'morning'],
      visit_min: 60,
      dish: null,
    });
    // The failed web run is replaced; the ready web profile keeps its text and times.
    expect(await row(failed)).toMatchObject({ status: 'ready', basis: 'reviewed_note' });
    expect(await row(profiled)).toMatchObject({
      basis: 'web',
      texts: { en: { why_go: 'From the web.' } },
      best_times: ['morning'],
    });
    const { rows } = await harness.pool.query<{ editorial: unknown }>(
      'SELECT editorial FROM pois WHERE id = $1',
      [eatery],
    );
    expect(rows[0]?.editorial).toEqual(EATERY_NOTE);
  });

  it('passes typed places over unless forced', async () => {
    const again = network();
    expect(await typeCuratedPlaces(harness.pool, again.deps, { force: false })).toMatchObject({
      places: 0,
      typed: 0,
    });
    expect(again.calls).toEqual([]);
    const forced = network();
    const report = await typeCuratedPlaces(harness.pool, forced.deps, {
      force: true,
      destination: 'vn-da-lat',
    });
    expect(report).toMatchObject({ places: 3, typed: 3 });
    expect(Number((await row(eatery))?.['cost_micros'])).toBeGreaterThan(0);
  });

  it('is no profile to the profile job, and its spend is not the job’s', async () => {
    const now = new Date();
    // With the note, the job skips the place as before.
    expect(skipReason(await loadProfileTarget(harness.pool, eatery), false, 0, 1)).toBe('reviewed');
    // Typing costs are left out of the job's daily cap.
    expect(await spentTodayMicros(harness.pool, now)).toBe(0);
    // Once the note is gone, the typed row does not stand in for a profile.
    await harness.pool.query(`UPDATE pois SET editorial = '{}' WHERE id = $1`, [house]);
    const target = await loadProfileTarget(harness.pool, house);
    expect(target?.status).toBeNull();
    expect(skipReason(target, false, 0, 1)).toBeNull();
    expect(await warmPlaces(harness.pool, destinationId, 10)).toContain(house);
  });
});
