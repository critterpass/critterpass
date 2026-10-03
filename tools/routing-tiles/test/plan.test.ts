/**
 * The committed box list and the build plan made from it: every destination that needs routing
 * has a box and a Geofabrik extract, boxes widen by 30 km, and each extract is downloaded once.
 */
import { describe, expect, it } from 'vitest';

import { bufferBbox, readBoxes, type BoxesFile } from '../src/boxes';
import { createManifest } from '../src/manifest';
import { buildPlan, slugsWithoutRegion } from '../src/plan';

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

describe('committed boxes', () => {
  it('cover the live destinations the planning legs need, each with an extract', () => {
    const slugs = committed.boxes.map((box) => box.slug);
    expect(slugs).toEqual(expect.arrayContaining(['bali', 'da-nang', 'kyoto', 'vn-hoi-an']));
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugsWithoutRegion(committed)).toEqual([]);
  });
});

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

  it('fails instead of dropping a box with no extract', () => {
    expect(() => buildPlan(file('da-nang', 'xx-new-town'))).toThrow(
      'no Geofabrik region for xx-new-town',
    );
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
