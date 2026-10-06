/**
 * The box lists and the build plan made from them: boxes widen by 30 km, each extract is
 * downloaded once, a box with no known extract is left out and reported, the api's answer is
 * checked before use, and a build starts only when the boxes changed.
 */
import { describe, expect, it } from 'vitest';

import { join } from 'node:path';

import { bufferBbox, fetchBoxes, readBoxes, readBoxesFile, type BoxesFile } from '../src/boxes';
import { createManifest } from '../src/manifest';
import { boxesChanged, buildPlan } from '../src/plan';
import { regionFor } from '../src/regions';

const committed = readBoxes();

const KM_PER_DEGREE = 111.32;

function file(...slugs: string[]): BoxesFile {
  return {
    generatedAt: '2026-10-04',
    boxes: slugs.map((slug) => ({
      slug,
      reason: 'live',
      bbox: committed.boxes.find((box) => box.slug === slug)?.bbox ?? [0, 0, 1, 1],
    })),
  };
}

describe('bufferBbox', () => {
  it('widens every side by 30 km, more degrees of longitude away from the equator', () => {
    const [minLon, minLat, maxLon, maxLat] = bufferBbox([108, 16, 108.3, 16.2]);
    expect((16 - minLat) * KM_PER_DEGREE).toBeCloseTo(30, 0);
    expect((maxLat - 16.2) * KM_PER_DEGREE).toBeCloseTo(30, 0);
    const lonKm = (108 - minLon) * KM_PER_DEGREE * Math.cos((16.2 * Math.PI) / 180);
    expect(lonKm).toBeCloseTo(30, 0);
    expect(maxLon - 108.3).toBeCloseTo(108 - minLon, 4);
    const [icelandMinLon] = bufferBbox([-22.35, 63.7, -19.5, 64.85]);
    expect(-22.35 - icelandMinLon).toBeGreaterThan(0.6);
  });

  it('stays inside WGS84', () => {
    const [, , maxLon, maxLat] = bufferBbox([179.9, 89.9, 180, 90]);
    expect([maxLon, maxLat]).toEqual([180, 90]);
    const [minLon, minLat] = bufferBbox([-180, -90, -179.9, -89.9]);
    expect([minLon, minLat]).toEqual([-180, -90]);
  });
});

describe('buildPlan', () => {
  it('downloads each extract once for all the boxes inside it', () => {
    const plan = buildPlan(file('da-nang', 'vn-hoi-an', 'bali', 'kyoto'));
    expect(
      plan.regions.map((region) => [region.region, region.boxes.map((box) => box.slug)]),
    ).toEqual([
      ['asia/indonesia/nusa-tenggara', ['bali']],
      ['asia/japan/kansai', ['kyoto']],
      ['asia/vietnam', ['da-nang', 'vn-hoi-an']],
    ]);
    expect(plan.regions[2]?.url).toBe('https://download.geofabrik.de/asia/vietnam-latest.osm.pbf');
    const daNang = plan.regions[2]?.boxes[0];
    expect(daNang?.osmium).toBe(daNang?.bbox.join(','));
  });

  it('builds only the boxes asked for, refusing unknown slugs', () => {
    const plan = buildPlan(committed, { only: ['da-nang', 'bali'] });
    expect(plan.slugs).toEqual(['bali', 'da-nang']);
    expect(() => buildPlan(committed, { only: ['atlantis'] })).toThrow('no box for atlantis');
  });

  it('leaves out and reports a box with no extract, refusing it when asked for by name', () => {
    const plan = buildPlan(file('da-nang', 'xx-new-town'));
    expect(plan.slugs).toEqual(['da-nang']);
    expect(plan.withoutRegion).toEqual(['xx-new-town']);
    expect(() => buildPlan(file('da-nang', 'xx-new-town'), { only: ['xx-new-town'] })).toThrow(
      'no Geofabrik region for xx-new-town',
    );
  });

  it("plans the pull request's dry run for Đà Lạt and Iceland", () => {
    const plan = buildPlan(readBoxesFile(join(import.meta.dirname, 'fixtures/dry-run-boxes.json')));
    expect(
      plan.regions.map((region) => [region.region, region.boxes.map((box) => box.slug)]),
    ).toEqual([
      ['asia/vietnam', ['vn-da-lat']],
      ['europe/iceland', ['iceland']],
    ]);
  });
});

describe('regionFor', () => {
  it("takes a named destination's extract, else its country's single extract", () => {
    expect(regionFor('kyoto')).toBe('asia/japan/kansai');
    expect(regionFor('vn-con-dao')).toBe('asia/vietnam');
    expect(regionFor('pe-lima')).toBe('south-america/peru');
    // Japan and Indonesia are split: a new city there needs its region named.
    expect(regionFor('jp-sapporo')).toBeUndefined();
    expect(regionFor('atlantis')).toBeUndefined();
  });
});

describe('fetchBoxes', () => {
  const answer = {
    generatedAt: '2026-10-06',
    boxes: [{ slug: 'vn-da-lat', reason: 'live', bbox: [108.3632, 11.8675, 108.5119, 12.013] }],
  };

  it("reads the api's routing boxes", async () => {
    const asked: string[] = [];
    const fetcher = ((url: string) => {
      asked.push(url);
      return Promise.resolve(Response.json(answer));
    }) as typeof fetch;
    const boxes = await fetchBoxes('https://api.example.test/', fetcher);
    expect(asked).toEqual(['https://api.example.test/v1/routing/boxes']);
    expect(boxes.boxes.map((box) => box.slug)).toEqual(['vn-da-lat']);
  });

  it('refuses an error status or a malformed box', async () => {
    const status = (() => Promise.resolve(new Response('nope', { status: 503 }))) as typeof fetch;
    await expect(fetchBoxes('https://api.example.test', status)).rejects.toThrow('503');
    const malformed = { ...answer, boxes: [{ ...answer.boxes[0], bbox: [1, 1, 1, 1] }] };
    const empty = (() => Promise.resolve(Response.json(malformed))) as typeof fetch;
    await expect(fetchBoxes('https://api.example.test', empty)).rejects.toThrow();
  });
});

describe('boxesChanged', () => {
  const plan = buildPlan(file('da-nang', 'bali'));
  const built = plan.regions.flatMap((region) => region.boxes);

  it('is false for the same boxes in any order, true for a new, gone or moved box', () => {
    expect(boxesChanged(plan, [...built].reverse())).toBe(false);
    expect(boxesChanged(plan, built.slice(1))).toBe(true);
    expect(boxesChanged(plan, [...built, { slug: 'kyoto', bbox: [1, 2, 3, 4] }])).toBe(true);
    const [first, ...rest] = built;
    expect(boxesChanged(plan, [{ ...first!, bbox: [0, 0, 1, 1] }, ...rest])).toBe(true);
  });
});

describe('manifest', () => {
  it('carries the ODbL attribution and refuses a malformed build id or checksum', () => {
    const base = {
      build: '20261004T013005Z',
      createdAt: '2026-10-04T01:40:00.000Z',
      osm: { 'asia/vietnam': '2026-10-03T20:21:02Z' },
      boxes: [
        { slug: 'da-nang', bbox: [107.6, 15.5, 108.7, 16.5] as [number, number, number, number] },
      ],
      tiles: {
        url: 'https://github.com/critterpass/critterpass/releases/download/routing-tiles/valhalla-tiles-20261004T013005Z.tar.gz',
        encoding: 'gzip' as const,
        bytes: 1,
        sha256: 'a'.repeat(64),
      },
    };
    expect(createManifest(base).attribution).toContain('OpenStreetMap contributors');
    expect(() => createManifest({ ...base, tiles: { ...base.tiles, sha256: 'nope' } })).toThrow();
    expect(() => createManifest({ ...base, build: '2026-10-04' })).toThrow();
  });
});
