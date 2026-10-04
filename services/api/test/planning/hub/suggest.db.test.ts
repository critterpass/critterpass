/**
 * Tokek's suggestions over HTTP on the real stack: curated places nobody saved, the caller didn't
 * hide and the plan doesn't hold, ranked by fit and paged by cursor. A hide leaves only the hider's
 * list, an outsider gets NOT_FOUND, and the kept ranking gives way to a new plan version.
 */
import { withSystem } from '@cp/db';
import { placeFitSchema, type PlaceFit } from '@cp/domain';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearSuggestCache } from '../../../src/planning/hub/rank';
import { registerSuggestRoute } from '../../../src/planning/hub/suggest-route';
import { seedCurrentPlan, type SeededPlan } from '../../plan/plan-fixture';
import {
  buildSetupCrew,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';
import { seedLiveDestinations } from '../../travel-data/travel-seed';

let harness: SetupHarness;
let a: SetupCrew;
let b: SetupCrew;
let plan: SeededPlan;
let kyoto: string;
let places: string[];
let saved: string;
let planned: string;
let closed: string;

const week = (start: string, end: string) => ({
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, [{ start, end }]]),
  ),
});

async function insertPlace(pool: pg.Pool, name: string, offset: number, hours: unknown) {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, curation, hours, editorial)
       VALUES ($1, $2, 'temple_shrine', $3, $4, 'editorial', $5, '{"time_needed_min": 60}')
       RETURNING id`,
      [kyoto, name, 35.0 + offset / 900, 135.77 + offset / 1100, JSON.stringify(hours)],
    );
    return rows[0]!.id;
  });
}

interface Page {
  places: { poi_id: string; fit: PlaceFit }[];
  next_cursor: string | null;
  total: number;
}

const suggest = async (who: SignedIn, tripId: string, query = '') => {
  const response = await harness.request(`/v1/trips/${tripId}/places/suggest${query}`, {
    headers: { cookie: who.cookie },
  });
  return { status: response.status, body: (await response.json()) as Page };
};

/** Every page for the caller, following the cursor. */
async function allPages(who: SignedIn, limit = 30) {
  const pages: Page[] = [];
  let cursor: string | null = '0';
  while (cursor !== null) {
    const { status, body } = await suggest(who, a.tripId, `?limit=${limit}&cursor=${cursor}`);
    expect(status).toBe(200);
    pages.push(body);
    cursor = body.next_cursor;
  }
  return pages;
}

/** The curated places the suggestions are drawn from, minus the crew's saves and the plan's. */
async function eligible(hiddenBy: string | null): Promise<number> {
  const { rows } = await harness.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pois p
      WHERE p.destination_id = $1 AND p.status = 'active' AND p.curation = 'editorial'
        AND p.merged_into_id IS NULL AND p.category NOT IN ('stay', 'transit')
        AND p.id <> ALL($2::uuid[])
        AND NOT EXISTS (SELECT 1 FROM place_hides h WHERE h.poi_id = p.id AND h.user_id = $3)`,
    [kyoto, [saved, planned], hiddenBy],
  );
  return rows[0]!.n;
}

beforeAll(async () => {
  harness = await startSetupHarness(undefined, (app, deps) => registerSuggestRoute(app, deps));
  a = await buildSetupCrew(harness, 2);
  b = await buildSetupCrew(harness, 1);
  kyoto = (await seedLiveDestinations(harness.pool))['kyoto'] ?? '';
  places = [];
  for (let i = 0; i < 40; i += 1)
    places.push(await insertPlace(harness.pool, `Shrine ${i}`, i, week('08:00', '18:00')));
  closed = await insertPlace(harness.pool, 'Shut shrine', 41, week('08:00', '18:00'));
  [saved, planned] = [places[0]!, places[1]!];
  await withSystem(harness.pool, async (tx) => {
    await tx.query('UPDATE trips SET destination_id = $1, tz = $2 WHERE id = ANY($3)', [
      kyoto,
      'Asia/Tokyo',
      [a.tripId, b.tripId],
    ]);
    await tx.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
      [a.tripId, a.members[1]!.uid],
    );
    await tx.query(
      `INSERT INTO trip_ideas (trip_id, poi_id, name, category, lat, lng, sources, created_by)
       VALUES ($1, $2, 'Shrine 0', 'temple_shrine', 35, 135.77, ARRAY['save'], $3)`,
      [a.tripId, saved, a.organiser.uid],
    );
  });
  plan = await seedCurrentPlan(harness.pool, a.tripId);
  await harness.pool.query('UPDATE plan_items SET poi_id = $2 WHERE stable_id = $1', [
    plan.museum,
    planned,
  ]);
  // Open only on a weekday the trip never sees: no day fits it, so it ranks below every place that
  // fits.
  const tripDays = new Set(plan.dates.map((date) => new Date(`${date}T12:00:00Z`).getUTCDay()));
  const keys = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
  const off = keys.find((_, index) => !tripDays.has(index)) ?? 'su';
  await harness.pool.query('UPDATE pois SET hours = $2 WHERE id = $1', [
    closed,
    JSON.stringify({ weekly: { [off]: [{ start: '08:00', end: '18:00' }] } }),
  ]);
}, 240_000);

beforeEach(() => clearSuggestCache());

afterAll(async () => {
  await harness?.stop();
});

describe('GET /v1/trips/{id}/places/suggest', () => {
  it('pages every suggestion by fit, without the crew saves or the plan places', async () => {
    const pages = await allPages(a.members[1]!);
    expect(pages.length).toBeLessThanOrEqual(Math.ceil((await eligible(null)) / 30));
    const listed = pages.flatMap((page) => page.places);
    const ids = listed.map((entry) => entry.poi_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(await eligible(null));
    expect(pages[0]!.total).toBe(ids.length);
    expect(ids).not.toContain(saved);
    expect(ids).not.toContain(planned);
    expect(ids).toEqual(expect.arrayContaining(places.slice(2)));
    for (const entry of listed) expect(placeFitSchema.parse(entry.fit)).toEqual(entry.fit);
    const mine = listed.filter((entry) => [...places, closed].includes(entry.poi_id));
    expect(mine.at(-1)?.poi_id).toBe(closed);
    expect(mine.at(-1)?.fit.best).toBeNull();
    expect(mine[0]?.fit.best?.grade).toBe('good');
  });

  it('leaves a hidden place out for the hider only', async () => {
    const hidden = places[5]!;
    await withSystem(harness.pool, (tx) =>
      tx.query('INSERT INTO place_hides (user_id, poi_id) VALUES ($1, $2)', [
        a.members[1]!.uid,
        hidden,
      ]),
    );
    const hider = (await allPages(a.members[1]!)).flatMap((page) => page.places);
    expect(hider.map((entry) => entry.poi_id)).not.toContain(hidden);
    expect(hider).toHaveLength(await eligible(a.members[1]!.uid));
    const other = (await allPages(a.organiser)).flatMap((page) => page.places);
    expect(other.map((entry) => entry.poi_id)).toContain(hidden);
  });

  it('is NOT_FOUND for someone outside the trip, and checks its query', async () => {
    expect((await suggest(b.organiser, a.tripId)).status).toBe(404);
    expect((await suggest(a.organiser, a.tripId, '?limit=31')).status).toBe(422);
  });

  it('keeps its ranking until the plan has a new version', async () => {
    const first = await suggest(a.organiser, a.tripId, '?limit=30');
    const late = await insertPlace(harness.pool, 'Late shrine', 2, week('08:00', '18:00'));
    const kept = await suggest(a.organiser, a.tripId, '?limit=30');
    expect(kept.body.total).toBe(first.body.total);
    await seedCurrentPlan(harness.pool, a.tripId);
    const fresh = (await allPages(a.organiser)).flatMap((page) => page.places);
    expect(fresh.map((entry) => entry.poi_id)).toContain(late);
  });
});
