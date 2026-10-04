/**
 * Street-level photos for places with nothing else, on recorded Mapillary answers
 * (test/fixtures/media-street) and recorded model verdicts: geometry keeps only images that can
 * show the place, and the check keeps only a photo that is of this place.
 */
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGateway } from '@cp/ai';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';

import {
  looksAcrossTheStreet,
  streetCandidates,
  streetImagesNear,
  type StreetImage,
} from '../src/kinds/media/mapillary';
import { acceptsPhoto, checkPhoto, type PhotoVerdict } from '../src/kinds/media/photo-check';
import { replayFetch } from './fixture-fetch';
import { BLESSED_SACRAMENT, RIVERSIDE_GRILL, STREET_NOW } from './media-street-fixture';

const recorded = {
  fetch: () => Promise.reject(new Error('the recorded answers cover every request')),
  cacheDir: path.join(import.meta.dirname, 'fixtures', 'media-street'),
  now: () => STREET_NOW,
};

/** A point `north` and `east` metres from the origin of the synthetic street. */
const ORIGIN = { lat: 16.06, lng: 108.22 };
const at = (north: number, east: number) => ({
  lat: ORIGIN.lat + north / 111_320,
  lng: ORIGIN.lng + east / (111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180)),
});
const frame = (id: string, north: number, east: number, angle: number, rest = {}): StreetImage => ({
  id,
  capturedAt: Date.parse('2024-05-01T00:00:00Z') + Number(id) * 1000,
  ...at(north, east),
  angle,
  pano: false,
  sequence: 'walk',
  creator: 'someone',
  width: 4000,
  height: 3000,
  file: `https://scontent.example/${id}.jpg`,
  preview: `https://scontent.example/${id}-1024.jpg`,
  ...rest,
});

describe('which street images can show a place', () => {
  // The place stands 12 m east of a street that runs north.
  const place = at(0, 12);

  it('keeps an image 6 to 30 m away whose camera points at the place', () => {
    const images = [
      frame('1', 0, 0, 90, { sequence: 'a' }),
      frame('2', 0, 9, 90, { sequence: 'b' }),
      frame('3', 0, -30, 90, { sequence: 'c' }),
      frame('4', 0, 0, 180, { sequence: 'd' }),
      frame('5', 0, 0, 90, { sequence: 'e', pano: true }),
      frame('6', -10, 0, 50, { sequence: 'f' }),
    ];
    const kept = streetCandidates(place, images);
    // 2 stands 3 m away, 3 stands 42 m away, 4 looks south, 5 is a panorama.
    expect(kept.map((c) => c.image.id)).toEqual(['6', '1']);
    expect(kept.map((c) => [c.distanceM, c.offAxisDeg, c.year])).toEqual([
      [16, 0, 2024],
      [12, 0, 2024],
    ]);
  });

  it('takes one image per sequence, the squarest, newest sequence first, three at most', () => {
    const images = [
      frame('1', -6, 0, 90, { sequence: 'old' }),
      frame('2', 0, 0, 90, { sequence: 'old' }),
      frame('10', 0, 0, 80, { sequence: 'new' }),
      frame('20', 0, -5, 90, { sequence: 'newer' }),
      frame('30', 0, -10, 90, { sequence: 'newest' }),
    ];
    expect(streetCandidates(place, images).map((c) => c.image.id)).toEqual(['30', '20', '10']);
    expect(streetCandidates(place, images, 5).map((c) => c.image.id)).toEqual([
      '30',
      '20',
      '10',
      '2',
    ]);
  });

  it('never looks at the other side of the street, when the side can be told', () => {
    // A walk north along the street: the place is on its right.
    const walk = (angle: number) => [
      frame('1', -8, 0, 0),
      frame('2', 0, 0, angle),
      frame('3', 8, 0, 0),
    ];
    const second = (images: StreetImage[]) => images[1]!;
    expect(looksAcrossTheStreet(place, second(walk(300)), walk(300))).toBe(true);
    expect(looksAcrossTheStreet(place, second(walk(60)), walk(60))).toBe(false);
    // Looking along the street, the camera is on neither side.
    expect(looksAcrossTheStreet(place, second(walk(5)), walk(5))).toBe(false);
    // A place on the line of travel has no side, and a lone frame no line of travel.
    expect(looksAcrossTheStreet(at(20, 1), second(walk(300)), walk(300))).toBe(false);
    const alone = frame('9', 0, 0, 300, { sequence: 'alone' });
    expect(looksAcrossTheStreet(place, alone, [alone])).toBe(false);
  });

  it('finds the church front among the images Mapillary has around it', async () => {
    const images = await streetImagesNear(recorded, 'token-under-test', BLESSED_SACRAMENT);
    const kept = streetCandidates(BLESSED_SACRAMENT, images);
    expect(kept.map((c) => c.image.id)).toEqual(['359209072305480', '1018975135577358']);
    for (const candidate of kept) {
      expect(candidate.image.pano).toBe(false);
      expect(candidate.distanceM).toBeGreaterThanOrEqual(6);
      expect(candidate.distanceM).toBeLessThanOrEqual(30);
      expect(candidate.offAxisDeg).toBeLessThanOrEqual(30);
    }
    expect(kept[0]!.image.capturedAt).toBeGreaterThan(kept[1]!.image.capturedAt);
  });
});

describe('which photo may stand for a place', () => {
  const good: PhotoVerdict = {
    shows: 'building_front',
    fills_frame: true,
    well_lit: true,
    sharp: true,
    names: 'none',
    kind_fits: true,
    sure: true,
    reason: 'A church front.',
  };

  it('is a landmark of its kind, or any place under its own name', () => {
    expect(acceptsPhoto(good, 'temple_shrine')).toBe(true);
    expect(acceptsPhoto({ ...good, shows: 'feature' }, 'beach')).toBe(true);
    expect(acceptsPhoto({ ...good, names: 'this_place', kind_fits: false }, 'food')).toBe(true);
    // A restaurant front with no name could be the one next door.
    expect(acceptsPhoto(good, 'food')).toBe(false);
    expect(acceptsPhoto(good, 'nightlife')).toBe(false);
  });

  it('is never another place, the road, a dark or blurred frame, or a guess', () => {
    expect(acceptsPhoto({ ...good, names: 'another' }, 'temple_shrine')).toBe(false);
    expect(acceptsPhoto({ ...good, kind_fits: false }, 'temple_shrine')).toBe(false);
    for (const shows of ['road', 'vehicles', 'dashboard', 'wall', 'people', 'other'] as const) {
      expect(acceptsPhoto({ ...good, shows, names: 'this_place' }, 'temple_shrine')).toBe(false);
    }
    expect(acceptsPhoto({ ...good, fills_frame: false }, 'temple_shrine')).toBe(false);
    expect(acceptsPhoto({ ...good, well_lit: false }, 'temple_shrine')).toBe(false);
    expect(acceptsPhoto({ ...good, sharp: false }, 'temple_shrine')).toBe(false);
    expect(acceptsPhoto({ ...good, sure: false }, 'temple_shrine')).toBe(false);
  });

  const jpeg = createCanvas(64, 48).toBuffer('image/jpeg');
  const check = (names: string[]) => {
    const replay = replayFetch(names);
    return {
      replay,
      deps: {
        gateway: createGateway({ apiKey: 'test-key', fetch: replay.fetch, maxAttempts: 1 }),
        cacheDir: mkdtempSync(path.join(os.tmpdir(), 'street-checks-')),
      },
    };
  };

  it('keeps the church front the model saw, and asks about it once', async () => {
    const { replay, deps } = check(['deepseek-photo-check-keep']);
    const first = await checkPhoto(deps, '1018975135577358', jpeg, BLESSED_SACRAMENT);
    expect(first.accepted).toBe(true);
    expect(first.reason).toMatch(/church/iu);
    const again = await checkPhoto(deps, '1018975135577358', jpeg, BLESSED_SACRAMENT);
    expect(again).toMatchObject({ accepted: true, reason: first.reason, costMicros: 0 });
    expect(replay.requests).toHaveLength(1);
  });

  it('turns down the restaurant next door, under its own sign', async () => {
    const { deps } = check(['deepseek-photo-check-other-name']);
    const verdict = await checkPhoto(deps, '4703989716294526', jpeg, RIVERSIDE_GRILL);
    expect(verdict.accepted).toBe(false);
    expect(verdict.verdict?.names).toBe('another');
    expect(verdict.reason).toMatch(/ponto final/iu);
  });
});
