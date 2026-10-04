/**
 * A place-photo batch end to end, without the network: its curated places come from the release
 * given, a busy source is asked again and then left out of one search, and the review page of a
 * destination lists every proposed photo with its place, kind, licence and credit.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildRelease, poiRefSubject, type ContentItem } from '@cp/content';
import { describe, expect, it } from 'vitest';

import { committedItems } from '../src/committed';
import { GENERIC_TITLE } from '../src/kinds/media/generic';
import { getJson } from '../src/kinds/media/http';
import { genericPhotos } from '../src/kinds/media/generic-batch';
import { curatedPlaces, suggestedDrops, type PlaceProposal } from '../src/kinds/media/place-batch';
import { wikidataOwn, type MediaPlace } from '../src/kinds/media/places';
import { needsALook, renderPlacePages } from '../src/kinds/media/review-page';

const place = (name: string, category: string, lat: number, lng: number, ref = 'fsq_os:a1') => ({
  ref,
  destination: 'kyoto',
  name,
  category,
  lat,
  lng,
});

describe('the curated places of a batch', () => {
  it('come from the release given, without merged places or refs no subject can name', () => {
    const [first] = committedItems('places');
    if (first === undefined) throw new Error('no committed places');
    const made = { ...first, ref: 'editorial:wikidata-Q391406', name: 'Mỹ Sơn' };
    const unnamed = { ...first, ref: 'osm:node/1', name: 'A mapped stone' };
    const merged = { ...first, ref: 'fsq_os:ffff', merge_into: first.ref };
    const places = curatedPlaces([first.destination], [], [first, made, unnamed, merged]);
    expect(places.map((p) => p.ref)).toEqual([first.ref, made.ref]);
    expect(curatedPlaces(['kyoto'], [], [first])).toEqual([]);
  });

  it("gives a place made from a Wikidata item that item's image, whatever its name", async () => {
    const asked: string[] = [];
    const http = {
      fetch: ((input: URL) => {
        asked.push(input.searchParams.get('query') ?? '');
        return Promise.resolve(
          new Response(
            JSON.stringify({
              results: {
                bindings: [
                  {
                    item: { value: 'http://www.wikidata.org/entity/Q391406' },
                    image: {
                      value: 'http://commons.wikimedia.org/wiki/Special:FilePath/My%20Son%20B5.jpg',
                    },
                  },
                ],
              },
            }),
            { status: 200 },
          ),
        );
      }) as unknown as typeof fetch,
      cacheDir: mkdtempSync(path.join(os.tmpdir(), 'media-own-')),
      now: () => 1,
    };
    const mySon: MediaPlace = {
      ...place('Thánh địa Mỹ Sơn', 'museum', 15.7641, 108.1241, 'editorial:wikidata-Q391406'),
      destination: 'da-nang',
    };
    const temple = place('高台寺', 'temple_shrine', 35, 135.78);
    const matches = await wikidataOwn(http, [mySon, temple]);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('wd:Q391406');
    expect([...matches.keys()]).toEqual([mySon.ref]);
    expect(matches.get(mySon.ref)?.item).toMatchObject({
      id: 'Q391406',
      file: 'File:My Son B5.jpg',
    });
    expect(await wikidataOwn(http, [temple])).toEqual(new Map());
  });
});

describe('a busy source', () => {
  it('is asked again after a dropped connection and the wait it names, then cached', async () => {
    const waits: number[] = [];
    const answers: (Response | TypeError)[] = [
      new TypeError('fetch failed'),
      new Response('slow down', { status: 429, headers: { 'retry-after': '7' } }),
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ];
    const http = {
      fetch: (() => {
        const answer = answers.shift() ?? new Response('', { status: 500 });
        return answer instanceof Response ? Promise.resolve(answer) : Promise.reject(answer);
      }) as typeof fetch,
      cacheDir: mkdtempSync(path.join(os.tmpdir(), 'media-http-')),
      now: () => 1,
      wait: (ms: number) => {
        waits.push(ms);
        return Promise.resolve();
      },
    };
    const url = new URL('https://query.wikidata.org/sparql?query=x');
    expect(await getJson(http, url)).toEqual({ ok: true });
    expect(waits).toEqual([5000, 7000]);
    expect(await getJson(http, url)).toEqual({ ok: true });
    expect(answers).toEqual([]);
  });
});

describe('generic stock when one source stays busy', () => {
  it('takes the other source’s photos and names the search that went unanswered', async () => {
    const pexels = {
      photos: [
        {
          id: 77,
          width: 4000,
          height: 2600,
          url: 'https://www.pexels.com/photo/tacos-77/',
          photographer: 'C. Cook',
          photographer_url: 'https://www.pexels.com/@cook',
          alt: 'Tacos on a plate',
          src: {
            original: 'https://images.pexels.com/photos/77/o.jpeg',
            large: 'https://images.pexels.com/photos/77/l.jpeg',
          },
        },
      ],
    };
    const http = {
      fetch: ((input: URL) =>
        Promise.resolve(
          input.host === 'api.pexels.com'
            ? new Response(JSON.stringify(pexels), { status: 200 })
            : new Response('Just a moment...', { status: 429 }),
        )) as unknown as typeof fetch,
      cacheDir: mkdtempSync(path.join(os.tmpdir(), 'media-generic-')),
      now: () => 1,
      wait: () => Promise.resolve(),
    };
    const taqueria = {
      ...place('Taquería La Loma', 'food', 19.4, -99.1),
      destination: 'mexico-city',
    };
    const unanswered: string[] = [];
    const photos = await genericPhotos(
      http,
      { pexelsKey: 'k', pixabayKey: 'k' },
      [taqueria],
      new Set(),
      unanswered,
    );
    expect([...photos.values()].map((p) => [p.id, p.title, p.subjects])).toEqual([
      ['pexels-photo-77', `${GENERIC_TITLE}tacos`, [poiRefSubject(taqueria.ref)]],
    ]);
    expect(unanswered).toEqual(['pixabay: tacos']);
  });
});

describe('the review page of a destination', () => {
  const photo = (id: string, subjects: string[], title: string): ContentItem<'media'> => ({
    id: `wikimedia-photo-${id}`,
    kind: 'photo',
    source: 'wikimedia',
    source_id: id,
    source_url: 'https://commons.wikimedia.org/wiki/File:A.jpg',
    download_url: 'https://upload.wikimedia.org/a.jpg',
    preview_url: 'https://upload.wikimedia.org/a.jpg',
    subjects,
    rank: 0,
    title,
    author: 'A. Author',
    author_url: null,
    licence: 'cc-by-sa-4.0',
    licence_url: 'https://creativecommons.org/licenses/by-sa/4.0',
    attribution_required: true,
    credit: 'A. Author · CC BY-SA 4.0 · Wikimedia Commons',
    width: 1920,
    height: 1280,
    duration_ms: null,
  });
  const temple: MediaPlace = place('高台寺', 'temple_shrine', 35, 135.78, 'fsq_os:a1');
  const cafe: MediaPlace = place('Kaikado Cafe', 'food', 35, 135.77, 'fsq_os:b2');
  const bar: MediaPlace = place('Trench', 'nightlife', 35, 135.76, 'fsq_os:c3');
  const proposals: PlaceProposal[] = [
    { place: temple, outcome: 'own', match: { label: '高台寺', score: 1, distanceM: 1200 } },
    { place: cafe, outcome: 'generic', match: null },
    { place: bar, outcome: 'none', match: null },
  ];

  it('marks a far or loosely named match to look at twice', () => {
    const [far, generic] = proposals;
    expect(far !== undefined && needsALook(far)).toBe(true);
    expect(generic !== undefined && needsALook(generic)).toBe(false);
    expect(
      needsALook({
        place: temple,
        outcome: 'own',
        match: { label: 'x', score: 0.67, distanceM: 5 },
      }),
    ).toBe(true);
    expect(
      needsALook({ place: temple, outcome: 'own', match: { label: 'x', score: 1, distanceM: 5 } }),
    ).toBe(false);
  });

  it('lists every proposed photo with its place, kind, licence and credit', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'media-pages-'));
    const items = [
      photo('1', [poiRefSubject(temple.ref)], 'x'),
      {
        ...photo('2', [poiRefSubject(cafe.ref)], `${GENERIC_TITLE}cup of coffee`),
        credit: 'Photo: B · Pexels',
      },
      photo('3', ['destination:kyoto'], 'Kyoto'),
    ];
    const files = await renderPlacePages(
      items,
      { proposals, unanswered: ['pixabay: tacos'] },
      new Map(),
      dir,
      '2026-10-04-media-01',
    );
    expect(files).toEqual(['places-kyoto.html']);
    const html = readFileSync(path.join(dir, 'places-kyoto.html'), 'utf8');
    const own = html.slice(html.indexOf('<h2>The place itself'), html.indexOf('<h2>Generic'));
    const generic = html.slice(html.indexOf('<h2>Generic'), html.indexOf('<h2>No photo'));
    expect(own).toContain('高台寺');
    expect(own).toContain('A. Author · CC BY-SA 4.0 · Wikimedia Commons');
    expect(own).toContain('cc-by-sa-4.0');
    expect(own).toContain('Look twice');
    expect(own).not.toContain('Kaikado');
    expect(generic).toContain('Kaikado Cafe');
    expect(generic).toContain('cup of coffee');
    expect(generic).toContain('Photo: B · Pexels');
    expect(html.slice(html.indexOf('<h2>No photo'))).toContain('Trench');
    expect(html).not.toContain('wikimedia-photo-3');
    expect(html).toContain('pixabay: tacos');
    expect(html).not.toContain('suggested to drop');
  });

  it('leads with the live photos suggested to drop, where they are shown today', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'media-pages-'));
    const generic = {
      ...photo('2', [poiRefSubject(cafe.ref)], `${GENERIC_TITLE}cup of coffee`),
      id: 'pixabay-photo-5116219',
      source: 'pixabay' as const,
      source_id: '5116219',
    };
    const live = buildRelease({
      kind: 'media',
      version: 4,
      items: [generic, photo('3', ['destination:kyoto'], 'Kyoto')],
      generated_by: {
        batch_key: 'live',
        route: null,
        model: null,
        generated_at: '2026-10-03T00:00:00Z',
      },
      approved_by: null,
    });
    const drops = suggestedDrops(live, [temple, cafe, bar]);
    expect(drops).toEqual([
      { id: 'pixabay-photo-5116219', reason: 'off-subject', destinations: ['kyoto'] },
    ]);
    await renderPlacePages(
      [generic],
      { proposals, unanswered: [], suggestedDrops: drops },
      new Map(),
      dir,
      '2026-10-04-media-01',
    );
    const html = readFileSync(path.join(dir, 'places-kyoto.html'), 'utf8');
    const first = html.slice(html.indexOf('<h2>Live today'), html.indexOf('<h2>The place itself'));
    expect(first).toContain('pixabay-photo-5116219');
    expect(first).toContain('Suggested to drop: off-subject');
    expect(first).toContain('Kaikado Cafe');
  });
});
