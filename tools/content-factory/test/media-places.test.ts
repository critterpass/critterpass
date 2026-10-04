/**
 * Place photos on recorded Wikidata and Commons responses (test/fixtures/media-places): a place
 * gets the image of the Wikidata item it is, with its licence and credit, never a landmark's photo
 * it only shares a word with, and never a stock photo; a place batch carries the live destination
 * media, since publishing replaces every asset.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  buildRelease,
  loadRelease,
  poiRefOfSubject,
  poiRefSubject,
  type ContentItem,
} from '@cp/content';
import { describe, expect, it } from 'vitest';

import { mediaKind } from '../src/kinds/media';
import type { SourceHttp } from '../src/kinds/media/http';
import { GENERIC_TITLE, genericSubjectFor } from '../src/kinds/media/generic';
import { curatedPlaces, liveHeld, restateLive } from '../src/kinds/media/place-batch';
import { matchPlace, nameScore, type WikidataPlace } from '../src/kinds/media/place-match';
import { placePhotos, sourceAllowedFor } from '../src/kinds/media/places';
import { REJECTED_MATCHES, turnedDown } from '../src/kinds/media/rejected';
import { runValidators } from '../src/validators/registry';
import { FACTORY_DIR } from '../src/work';
import {
  CATHEDRAL,
  EGG_CAFE,
  FIXTURE_PLACES,
  LINH_UNG,
  MARBLE,
  MY_KHE,
  NON_NUOC_PAGODA,
  TAILOR,
  VAN_THONG_CAVE,
} from './media-places-fixture';

const http: SourceHttp = {
  fetch: () => Promise.reject(new Error('the recorded responses cover every request')),
  cacheDir: path.join(import.meta.dirname, 'fixtures', 'media-places'),
  now: () => Date.parse('2026-10-03T08:00:00Z'),
};

const item = (id: string, labels: string[], lat: number, lng: number): WikidataPlace => ({
  id,
  labels,
  lat,
  lng,
  file: `File:${id}.jpg`,
});

describe('which Wikidata item a place is', () => {
  const dragonBridge = item('Q5305270', ['Cầu Rồng', 'Dragon Bridge'], 16.0612, 108.2271);
  const marble = item(
    'Q6755207',
    ['Ngũ Hành Sơn', 'Marble Mountains (Vietnam)'],
    16.0034,
    108.2627,
  );
  const hoiAnDong = item('Q36160', ['Hội An Đông'], 15.8811, 108.3315);
  const cathedral = item('Q10800905', ['Nhà thờ chính tòa Đà Nẵng'], 16.0667, 108.2235);

  it('matches a landmark by a name it goes by', () => {
    expect(matchPlace(MARBLE, [marble])?.item.id).toBe('Q6755207');
    expect(
      matchPlace(LINH_UNG, [item('Q1', ['Chùa Linh Ứng', 'Linh Ung Pagoda'], 16.1004, 108.2774)])
        ?.label,
    ).toBe('Chùa Linh Ứng');
  });

  it('never gives a café the landmark it is named after', () => {
    expect(matchPlace(EGG_CAFE, [dragonBridge])).toBeNull();
  });

  it('never gives a shop the photo of a ward it shares a word with', () => {
    expect(matchPlace(TAILOR, [hoiAnDong])).toBeNull();
  });

  it('never gives a pagoda or a cave the mountain it stands on', () => {
    expect(matchPlace(NON_NUOC_PAGODA, [marble])).toBeNull();
    expect(matchPlace(VAN_THONG_CAVE, [marble])).toBeNull();
  });

  it('leaves out items too far away (3 km for a mountain, 1.5 km for a church)', () => {
    expect(matchPlace(CATHEDRAL, [cathedral])?.item.id).toBe('Q10800905');
    expect(matchPlace(MARBLE, [{ ...marble, lat: 16.04 }])).toBeNull();
    expect(matchPlace(CATHEDRAL, [{ ...cathedral, lat: 16.085 }])).toBeNull();
  });

  it('needs more than the city and the place type in common', () => {
    expect(
      nameScore('Bệnh Viện C Đà Nẵng', 'Bệnh Viện C Đà Nẵng', 'Bệnh viện Đà Nẵng', false),
    ).toBe(0);
    expect(nameScore('Bảo Tàng Hội An', 'Bảo Tàng Hội An', 'Bảo tàng Hội An', false)).toBe(1);
  });
});

describe('place photos', { timeout: 60_000 }, () => {
  it('proposes each matched place its Commons image with licence and credit', async () => {
    const photos = await placePhotos(http, FIXTURE_PLACES);
    const named = new Set(photos.map((photo) => photo.place.ref));
    expect(named).toEqual(new Set([LINH_UNG.ref, MY_KHE.ref, MARBLE.ref, CATHEDRAL.ref]));
    for (const { place, item: candidate } of photos) {
      expect(candidate.source).toBe('wikimedia');
      expect(candidate.subjects).toContain(poiRefSubject(place.ref));
      expect(candidate.credit).toMatch(/Wikimedia Commons$/u);
      const free = candidate.licence === 'public-domain' || candidate.licence === 'cc0';
      expect(candidate.attribution_required).toBe(!free);
      expect(candidate.licence_url).toMatch(/^https:\/\//u);
    }
  });

  it('never offers a place the item a reviewer turned down for it', async () => {
    const photos = await placePhotos(http, FIXTURE_PLACES, { [LINH_UNG.ref]: ['Q18277260'] });
    expect(photos.map((photo) => photo.place.ref)).not.toContain(LINH_UNG.ref);
    expect(photos.map((photo) => photo.place.ref)).toContain(MY_KHE.ref);
  });

  it('keys a place by its source ref, which publishing resolves', () => {
    expect(poiRefSubject(LINH_UNG.ref)).toBe('poi:fsq-os-4d5cfd269895b1f725f8ea0f');
    expect(poiRefOfSubject('poi:fsq-os-4d5cfd269895b1f725f8ea0f')).toEqual({
      source: 'fsq_os',
      id: '4d5cfd269895b1f725f8ea0f',
    });
    expect(poiRefOfSubject('poi:01a0f4a2-e2c8-7be5-a86b-7c1df14c1f4b')).toBeNull();
    expect(poiRefOfSubject('destination:da-nang')).toBeNull();
  });

  it('puts the deck places first', () => {
    const places = curatedPlaces(['da-nang'], [MY_KHE.ref, LINH_UNG.ref]);
    expect(places.slice(0, 2).map((p) => p.ref)).toEqual([MY_KHE.ref, LINH_UNG.ref]);
    expect(places.every((p) => p.destination === 'da-nang')).toBe(true);
  });
});

describe('media sources and the release', { timeout: 60_000 }, () => {
  const stock = (subjects: string[]): ContentItem<'media'> => ({
    id: 'pexels-photo-26550067',
    kind: 'photo',
    source: 'pexels',
    source_id: '26550067',
    source_url: 'https://www.pexels.com/photo/da-nang-city-name-at-beach-26550067/',
    download_url: 'https://images.pexels.com/photos/26550067/original.jpeg',
    preview_url: 'https://images.pexels.com/photos/26550067/preview.jpeg',
    subjects,
    rank: 0,
    title: 'Da Nang beach',
    author: 'Pragyan Bezbaruah',
    author_url: null,
    licence: 'pexels',
    licence_url: 'https://www.pexels.com/license/',
    attribution_required: false,
    credit: 'Photo: Pragyan Bezbaruah · Pexels',
    width: 4000,
    height: 2600,
    duration_ms: null,
  });

  it('takes a stock photo for a place only as a labelled generic one', () => {
    const place = poiRefSubject(MY_KHE.ref);
    expect(sourceAllowedFor('pexels', place, 'Da Nang beach')).toBe(false);
    expect(sourceAllowedFor('pixabay', 'poi:01a0f4a2-e2c8-7be5-a86b-7c1df14c1f4b', null)).toBe(
      false,
    );
    expect(sourceAllowedFor('pexels', place, `${GENERIC_TITLE}tropical sandy beach`)).toBe(true);
    expect(sourceAllowedFor('wikimedia', place, null)).toBe(true);
    expect(sourceAllowedFor('pexels', 'destination:da-nang', null)).toBe(true);
    const unlabelled = runValidators(
      'media',
      [stock(['destination:da-nang', place])],
      mediaKind.validators,
    );
    expect(unlabelled.severity).toBe('fail');
  });

  it('never offers a landmark a generic photo, and only what the name says', () => {
    const at = (name: string, category: string) =>
      genericSubjectFor({ name, category, destination: 'da-nang' });
    expect(at('Chùa Mỹ Khê', 'temple_shrine')).toBeNull();
    expect(at('Bảo Tàng Hội An', 'museum')).toBeNull();
    expect(at('Marble Mountains', 'nature')).toBeNull();
    // A walking street filed under beaches is not a beach, and phố is a street, not phở.
    expect(at('An Thuong Walking Street - PHỐ ĐI BỘ', 'beach')).toBeNull();
    expect(at('Phở Hồng', 'food')?.key).toBe('pho');
    expect(at('Bánh Xèo Bà Dưỡng', 'food')?.key).toBe('banh-xeo');
    expect(at('Cộng Cà Phê', 'food')?.key).toBe('coffee');
    expect(at('Cà Phê Lầu 2', 'food')?.key).toBe('coffee');
    expect(at('East West Brewing Company', 'nightlife')?.key).toBe('craft-beer');
    expect(at('Bãi Biển Phạm Văn Đồng', 'beach')?.key).toBe('beach');
    expect(at('Cáliz', 'nightlife')).toBeNull();
  });

  it('states only the live items that show its places, and takes down what shows nothing', async () => {
    const photos = (await placePhotos(http, FIXTURE_PLACES)).map((p) => p.item);
    const elsewhere = 'poi:fsq-os-00000000000000000000aaaa';
    const beach = poiRefSubject(MY_KHE.ref);
    const hero = stock(['destination:da-nang']);
    const shared = {
      ...stock(['destination:da-nang', beach]),
      id: 'pexels-photo-2',
      source_id: '2',
    };
    const dropped = { ...stock([beach]), id: 'pexels-photo-3', source_id: '3' };
    const other = { ...stock([elsewhere]), id: 'pexels-photo-4', source_id: '4' };
    const kept = { ...photos[0]!, subjects: [...photos[0]!.subjects, elsewhere] };
    const live = buildRelease({
      kind: 'media',
      version: 3,
      items: [hero, shared, dropped, other, kept],
      generated_by: {
        batch_key: 'live',
        route: null,
        model: null,
        generated_at: '2026-10-01T00:00:00Z',
      },
      approved_by: null,
    });
    const held = liveHeld(live, FIXTURE_PLACES);
    expect(held.get(hero.id)).toMatchObject({ touched: false });
    expect(held.get(other.id)).toMatchObject({ touched: false });
    expect(held.get(shared.id)).toMatchObject({ touched: true, rest: ['destination:da-nang'] });
    // The batch proposes the Commons photo again, for its place and the one it keeps elsewhere.
    const stated = new Map([[kept.id, kept]]);
    const { removed, changed } = restateLive(held, stated);
    expect([...stated.keys()].sort()).toEqual([kept.id, shared.id, dropped.id].sort());
    expect(stated.get(shared.id)?.subjects).toEqual(['destination:da-nang']);
    expect(stated.get(dropped.id)?.subjects).toEqual([]);
    expect(removed.map((change) => change.id)).toEqual([dropped.id]);
    expect(changed.map((change) => [change.id, change.now])).toEqual([
      [shared.id, ['destination:da-nang']],
    ]);
    // The destination's hero and the other city's photo are not in the batch at all.
    expect(stated.has(hero.id)).toBe(false);
    expect(stated.has(other.id)).toBe(false);
    const whole = runValidators(
      'media',
      [...photos.slice(1), ...stated.values()],
      mediaKind.validators,
    );
    expect(whole.items.filter((item) => item.severity === 'fail')).toEqual([]);
    expect(whole.severity).not.toBe('fail');
  });
});

describe('the latest committed place media batch', () => {
  it('holds no generic photo or match a reviewer turned down', () => {
    const dir = path.join(FACTORY_DIR, 'batches', 'media');
    const latest = readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .sort()
      .at(-1);
    if (latest === undefined) throw new Error('no committed media batch');
    const { items } = loadRelease(
      JSON.parse(readFileSync(path.join(dir, latest), 'utf8')) as unknown,
      'media',
    );
    expect(items.filter((item) => turnedDown(item.id))).toEqual([]);
    const report = runValidators('media', items, mediaKind.validators);
    expect(report.severity).not.toBe('fail');
    // The matches a reviewer turned down are not in it.
    for (const [ref, ids] of Object.entries(REJECTED_MATCHES)) {
      const photos = items.filter((item) => item.subjects.includes(poiRefSubject(ref)));
      for (const id of ids) {
        expect(photos.filter((photo) => photo.title?.includes(`Wikidata ${id} `))).toEqual([]);
      }
    }
  });
});
