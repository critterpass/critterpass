/**
 * Place photos on recorded Wikidata and Commons responses (test/fixtures/media-places): a place
 * gets the image of the Wikidata item it is, with its licence and credit, never a landmark's photo
 * it only shares a word with, and never a stock photo; a place batch carries the live destination
 * media, since publishing replaces every asset.
 */
import path from 'node:path';

import { buildRelease, poiRefOfSubject, poiRefSubject, type ContentItem } from '@cp/content';
import { describe, expect, it } from 'vitest';

import { committedItems } from '../src/committed';
import { mediaKind } from '../src/kinds/media';
import type { SourceHttp } from '../src/kinds/media/http';
import { GENERIC_TITLE, genericSubjectFor } from '../src/kinds/media/generic';
import { carriedItems, curatedPlaces } from '../src/kinds/media/place-batch';
import { matchPlace, nameScore, type WikidataPlace } from '../src/kinds/media/place-match';
import { placePhotos, sourceAllowedFor } from '../src/kinds/media/places';
import { REJECTED_GENERIC } from '../src/kinds/media/rejected';
import { runValidators } from '../src/validators/registry';
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

  it('fails a place batch that would drop the destination media', async () => {
    const photos = (await placePhotos(http, FIXTURE_PLACES)).map((p) => p.item);
    const alone = runValidators('media', photos, mediaKind.validators);
    expect(alone.batch.map((b) => b.id)).toContain('keeps-the-destination-media');
    const live = buildRelease({
      kind: 'media',
      version: 3,
      items: [stock(['destination:da-nang']), { ...photos[0]!, id: photos[0]!.id }],
      generated_by: {
        batch_key: 'live',
        route: null,
        model: null,
        generated_at: '2026-10-01T00:00:00Z',
      },
      approved_by: null,
    });
    const carried = carriedItems(live, FIXTURE_PLACES);
    expect(carried.map((c) => c.id)).toEqual(['pexels-photo-26550067']);
    // A photo the destination shares with a researched place stays, for the destination alone.
    const shared = buildRelease({
      ...live,
      items: [stock(['destination:da-nang', poiRefSubject(MY_KHE.ref)])],
    });
    expect(carriedItems(shared, FIXTURE_PLACES).map((c) => c.subjects)).toEqual([
      ['destination:da-nang'],
    ]);
    const whole = runValidators('media', [...photos, ...carried], mediaKind.validators);
    expect(whole.severity).not.toBe('fail');
  });
});

describe('the committed place media batches', () => {
  it('hold no generic photo a reviewer turned down, and carry the destination media', () => {
    const items = committedItems('media');
    expect(items.filter((item) => REJECTED_GENERIC[item.id] !== undefined)).toEqual([]);
    const report = runValidators('media', items, mediaKind.validators);
    expect(report.severity).not.toBe('fail');
    expect(items.some((item) => item.subjects.some((s) => s.startsWith('destination:')))).toBe(
      true,
    );
  });
});
