/**
 * The machine picks of an uncurated destination on a migrated Postgres, with DeepSeek's recorded
 * answer for Đà Lạt replayed at the network boundary: the places it names are matched to our rows
 * (and dropped when we have none), the rest is filled from open data across kinds of place, the
 * rows that must never be suggested stay out, and a re-run replaces the ranks without rewriting
 * rows that did not change. A curated destination is left alone.
 */
import { createGateway, type AiUsageRecord } from '@cp/ai';
import { recommendedSql } from '@cp/db';
import { fixtureTransport } from '@cp/ai/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadDraftPlaces } from '../../../src/jobs/ai/draft/load-places';
import { ensurePlacePicks } from '../../../src/jobs/ai/draft/place-picks';
import { placesPickJob } from '../../../src/jobs/places/pick';
import { runPlacePick } from '../../../src/places/pick/run';
import { silent, startJobsHarness, until, type JobsHarness } from '../../helpers/jobs-harness';
import {
  FILL,
  NAMED_IN_ORDER,
  NEVER_PICKED,
  picksOf,
  seedDaLat,
  type DaLat,
} from './da-lat-places';

let harness: JobsHarness;
let daLat: DaLat;

beforeAll(async () => {
  harness = await startJobsHarness();
  daLat = await seedDaLat(harness.pool, 'picks');
}, 240_000);

afterEach(async () => {
  await harness.stopAll();
});

afterAll(async () => {
  await harness?.close();
});

function recorded(usage: AiUsageRecord[] = []) {
  return createGateway({
    apiKey: 'fixture-key',
    fetch: fixtureTransport(['place-picks-da-lat']).fetch,
    onUsage: (record) => {
      usage.push(record);
      return Promise.resolve();
    },
  });
}

const overloaded = () =>
  createGateway({
    apiKey: 'fixture-key',
    maxAttempts: 1,
    fetch: fixtureTransport(['anthropic/overloaded-529']).fetch,
  });

const FILL_NAMES = Object.values(FILL).flat();

describe('places.pick for a destination without a curated set', () => {
  it('ranks the named places we have first, then a mix of open data', async () => {
    const usage: AiUsageRecord[] = [];
    const report = await runPlacePick(
      harness.pool,
      { gateway: recorded(usage) },
      { slug: daLat.slug },
      silent,
    );
    expect(report).toEqual({
      destination: daLat.slug,
      status: 'picked',
      names: 'ok',
      named: 60,
      matched: NAMED_IN_ORDER.length,
      filled: FILL_NAMES.length,
      total: NAMED_IN_ORDER.length + FILL_NAMES.length,
    });
    // System usage: the call is on no user's and no trip's meter.
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ route: 'places.pick' });
    expect(usage[0]?.userId ?? null).toBeNull();
    expect(usage[0]?.tripId ?? null).toBeNull();

    const picks = await picksOf(harness.pool, daLat.destinationId);
    expect(picks.map((pick) => pick.rank)).toEqual(picks.map((_, index) => index + 1));
    const named = picks.filter((pick) => pick.source === 'named');
    expect(named.map((pick) => pick.name)).toEqual([...NAMED_IN_ORDER]);
    // Of the two An Cafe rows, the one on the street the model named.
    expect(named.find((pick) => pick.name === 'An Cafe')?.address).toContain('3 Tháng 2');

    const filled = picks.filter((pick) => pick.source === 'fill');
    expect(filled.map((pick) => pick.name).sort()).toEqual([...FILL_NAMES].sort());
    // The first seats after the named places go round the kinds, best row of each first.
    expect(filled.slice(0, 6).map((pick) => pick.name)).toEqual([
      'Langbiang',
      'Bếp Mộc 01',
      'Cà Phê Sương 01',
      'Chợ Nông Sản Trại Mát',
      'Quán Rượu Khuya 01',
      'Tiệm Len 01',
    ]);
    const names = new Set(picks.map((pick) => pick.name));
    for (const never of NEVER_PICKED) expect(names.has(never), never).toBe(false);
    expect(picks.filter((pick) => pick.name === 'An Cafe')).toHaveLength(1);
  });

  it('is left alone once picked, and a forced re-run writes the same ranks without touching rows', async () => {
    const before = await picksOf(harness.pool, daLat.destinationId);
    const stamp = async () =>
      (
        await harness.pool.query<{ at: Date }>(
          'SELECT max(updated_at) AS at FROM pois WHERE destination_id = $1',
          [daLat.destinationId],
        )
      ).rows[0]?.at.toISOString();
    const stamped = await stamp();

    const again = await runPlacePick(
      harness.pool,
      { gateway: recorded() },
      { destinationId: daLat.destinationId },
      silent,
    );
    expect(again).toMatchObject({ status: 'skipped', reason: 'already_picked' });

    const forced = await runPlacePick(
      harness.pool,
      { gateway: recorded() },
      { slug: daLat.slug, force: true },
      silent,
    );
    expect(forced).toMatchObject({ status: 'picked', total: before.length });
    expect(await picksOf(harness.pool, daLat.destinationId)).toEqual(before);
    expect(await stamp()).toBe(stamped);
  });

  it('replaces the ranks when the places change, and fills alone when the model cannot be asked', async () => {
    await harness.pool.query(
      "UPDATE pois SET status = 'hidden' WHERE destination_id = $1 AND name = 'Crazy House'",
      [daLat.destinationId],
    );
    await expect(
      runPlacePick(
        harness.pool,
        { gateway: overloaded() },
        { slug: daLat.slug, force: true, requireNames: true },
        silent,
      ),
    ).rejects.toThrow();

    const report = await runPlacePick(
      harness.pool,
      { gateway: overloaded() },
      { slug: daLat.slug, force: true },
      silent,
    );
    expect(report).toMatchObject({ status: 'picked', names: 'failed', named: 0, matched: 0 });
    const picks = await picksOf(harness.pool, daLat.destinationId);
    expect(picks).toHaveLength(report.total);
    expect(picks.map((pick) => pick.rank)).toEqual(picks.map((_, index) => index + 1));
    expect(picks.every((pick) => pick.source === 'fill')).toBe(true);
    const names = picks.map((pick) => pick.name);
    expect(names).not.toContain('Crazy House');
    // Well-known rows of a kind the fill takes are still there, now on their open-data merit.
    expect(names).toEqual(expect.arrayContaining(['Hồ Xuân Hương', 'Phở Hiếu', 'Bếp Mộc 01']));
    // "Crazy House" is stored as `other`, which the fill never takes.
    for (const never of NEVER_PICKED) expect(names).not.toContain(never);
  });

  it('leaves a destination with a curated set alone, and an unknown one too', async () => {
    const { rows } = await harness.pool.query<{ id: string }>(
      `INSERT INTO destinations (slug, name, country, tz, currency)
       VALUES ('hoi-an-picks', 'Hội An', 'Vietnam', 'Asia/Ho_Chi_Minh', 'VND') RETURNING id`,
    );
    const hoiAn = rows[0]?.id as string;
    await harness.pool.query(
      `INSERT INTO pois (destination_id, name, category, lat, lng, curation, source_ids, confidence)
       SELECT $1, 'Curated place ' || n, 'food', 15.88 + n * 0.004, 108.33, 'editorial', '{}', NULL
         FROM generate_series(1, 50) AS n`,
      [hoiAn],
    );
    await harness.pool.query(
      `INSERT INTO pois (destination_id, name, category, lat, lng, source_ids, confidence)
       VALUES ($1, 'Quán Cao Lầu Thanh', 'food', 15.87, 108.32, $2, 0.9)`,
      [hoiAn, JSON.stringify({ fsq_os: 'f', overture: 'o' })],
    );
    const report = await runPlacePick(
      harness.pool,
      { gateway: recorded() },
      { slug: 'hoi-an-picks', force: true },
      silent,
    );
    expect(report).toMatchObject({ status: 'skipped', reason: 'curated', total: 0 });
    expect(await picksOf(harness.pool, hoiAn)).toEqual([]);
    expect(await runPlacePick(harness.pool, {}, { slug: 'nowhere' }, silent)).toMatchObject({
      status: 'skipped',
      reason: 'unknown_destination',
    });
  });
});

describe('a picked destination that gains a curated set', () => {
  it('loses every pick, so its recommended places are the editors’ alone', async () => {
    const late = await seedDaLat(harness.pool, 'curated-later');
    const picked = await runPlacePick(harness.pool, {}, { slug: late.slug }, silent);
    expect(picked.total).toBeGreaterThan(0);
    expect(await picksOf(harness.pool, late.destinationId)).toHaveLength(picked.total);

    // The places release lands: fifty curated places, two of them rows that were picked.
    await harness.pool.query(
      `INSERT INTO pois (destination_id, name, category, lat, lng, curation, editorial)
       SELECT $1, 'Curated place ' || n, 'nature', 12.2 + n * 0.004, 108.44, 'editorial',
              jsonb_build_object('must_see', n <= 3)
         FROM generate_series(1, 48) AS n`,
      [late.destinationId],
    );
    await harness.pool.query(
      `UPDATE pois SET curation = 'editorial'
        WHERE destination_id = $1 AND name IN ('Hồ Xuân Hương', 'Chợ Đà Lạt')`,
      [late.destinationId],
    );

    const report = await runPlacePick(harness.pool, {}, { slug: late.slug }, silent);
    expect(report).toMatchObject({ status: 'skipped', reason: 'curated', cleared: picked.total });
    expect(await picksOf(harness.pool, late.destinationId)).toEqual([]);
    // A second run has nothing left to clear.
    expect(
      await runPlacePick(harness.pool, {}, { slug: late.slug, force: true }, silent),
    ).toMatchObject({ status: 'skipped', reason: 'curated', cleared: 0 });

    // What a draft reads is the curated set only: no stand-in must-sees beside the editors' own.
    const places = await loadDraftPlaces(harness.pool, late.destinationId, []);
    expect(places).toHaveLength(50);
    expect(places.every((poi) => poi.editorial)).toBe(true);
    expect(
      places
        .filter((poi) => poi.mustSee)
        .map((poi) => poi.name)
        .sort(),
    ).toEqual(['Curated place 1', 'Curated place 2', 'Curated place 3']);
    const { rows } = await harness.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pois p
        WHERE p.destination_id = $1 AND p.status = 'active' AND ${recommendedSql('p')}`,
      [late.destinationId],
    );
    expect(rows[0]?.n).toBe(50);
  });
});

describe('a draft that starts before a destination has picks', () => {
  it('fills from open data when its naming call fails, and has the job ask again', async () => {
    const other = await seedDaLat(harness.pool, 'inline');
    const boss = await harness.startRuntime([placesPickJob({ gateway: recorded() })]);
    const report = await ensurePlacePicks(
      harness.pool,
      { gateway: overloaded() },
      other.destinationId,
      silent,
      boss,
    );
    // The draft goes on with the fill: nothing named, so no stand-in must-sees yet.
    expect(report).toMatchObject({ status: 'picked', names: 'failed', matched: 0 });
    expect(report?.filled).toBeGreaterThan(0);

    // The forced job names the well-known places and replaces the ranks.
    await until(
      async () =>
        (await picksOf(harness.pool, other.destinationId)).some((pick) => pick.source === 'named'),
      60_000,
    );
    const picks = await picksOf(harness.pool, other.destinationId);
    expect(picks.filter((pick) => pick.source === 'named').map((pick) => pick.name)).toEqual([
      ...NAMED_IN_ORDER,
    ]);
    expect(picks.map((pick) => pick.rank)).toEqual(picks.map((_, index) => index + 1));
    const { rows } = await harness.pool.query<{ data: unknown }>(
      "SELECT data FROM pgboss.job WHERE name = 'places.pick' ORDER BY created_on",
    );
    expect(rows.map((row) => row.data)).toEqual([{ destination: other.slug, force: true }]);
  });
});
