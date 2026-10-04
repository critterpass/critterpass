/**
 * A place-photo batch end to end, without the network: its curated places come from the release
 * given, a busy source is asked again and then left out of one search, and the review page of a
 * destination lists every proposed photo with its place, kind, licence and credit.
 */
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { poiRefSubject } from '@cp/content';
import { describe, expect, it } from 'vitest';

import { committedItems } from '../src/committed';
import { GENERIC_TITLE } from '../src/kinds/media/generic';
import { getJson } from '../src/kinds/media/http';
import { genericPhotos } from '../src/kinds/media/generic-batch';
import { curatedPlaces } from '../src/kinds/media/place-batch';
import { wikidataOwn, type MediaPlace } from '../src/kinds/media/places';

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
      new Map(),
      unanswered,
    );
    expect([...photos.values()].map((p) => [p.id, p.title, p.subjects])).toEqual([
      ['pexels-photo-77', `${GENERIC_TITLE}tacos`, [poiRefSubject(taqueria.ref)]],
    ]);
    expect(unanswered).toEqual(['pixabay: tacos']);
    // A photo that is live for places of another city keeps them and gains this one; a photo
    // that is a destination's hero never doubles as a generic one.
    const elsewhere = ['poi:fsq-os-aaaa', 'poi:fsq-os-bbbb'];
    const kept = await genericPhotos(
      http,
      { pexelsKey: 'k', pixabayKey: undefined },
      [taqueria],
      new Map([['pexels-photo-77', elsewhere]]),
    );
    expect([...kept.values()].map((p) => p.subjects)).toEqual([
      [...elsewhere, poiRefSubject(taqueria.ref)],
    ]);
    const hero = await genericPhotos(
      http,
      { pexelsKey: 'k', pixabayKey: undefined },
      [taqueria],
      new Map([['pexels-photo-77', ['destination:mexico-city']]]),
    );
    expect(hero.size).toBe(0);
    const full = Array.from({ length: 20 }, (_, i) => `poi:fsq-os-${String(i).padStart(4, '0')}`);
    const none = await genericPhotos(
      http,
      { pexelsKey: 'k', pixabayKey: undefined },
      [taqueria],
      new Map([['pexels-photo-77', full]]),
    );
    expect(none.size).toBe(0);
  });
});
