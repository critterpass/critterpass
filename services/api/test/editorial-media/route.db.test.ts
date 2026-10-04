/**
 * `GET /v1/media`: ready assets for the asked subjects, hero first, with absolute public URLs,
 * smallest file first, and the credit and licence; pending assets and other subjects never show.
 * A place's kept Foursquare photos join only when asked for, after its own Commons photo and
 * before generic stock.
 */
import { replacePoiFoursquarePhotos, withSystem } from '@cp/db';
import { placeMediaListResponseSchema, type MediaListResponse } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerEditorialMediaRoute } from '../../src/editorial-media/route';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
const BASE = 'https://media.staging.critterpass.app';

async function asset(
  sourceId: string,
  subjects: string[],
  rank: number,
  status: 'ready' | 'pending',
  kind: 'photo' | 'video' = 'photo',
  source: 'wikimedia' | 'pexels' = 'wikimedia',
): Promise<string> {
  return withSystem(harness.pool, async (tx) => {
    const id = crypto.randomUUID();
    const variants =
      status === 'pending'
        ? []
        : [
            { key: `c/media/${id}/1242.webp`, format: 'webp', w: 1242, h: 828, bytes: 90_000 },
            { key: `c/media/${id}/480.webp`, format: 'webp', w: 480, h: 320, bytes: 20_000 },
            ...(kind === 'video'
              ? [{ key: `c/media/${id}/720.mp4`, format: 'mp4', w: 720, h: 406, bytes: 900_000 }]
              : []),
          ];
    await tx.query(
      `INSERT INTO media_assets (id, kind, source, source_id, source_url, download_url, subject_keys,
         rank, author, licence, licence_url, attribution_required, credit, blurhash, variants,
         poster_key, duration_ms, status)
       VALUES ($1, $2, $11, $3, 'https://commons.wikimedia.org/wiki/File:X.jpg',
         'https://upload.wikimedia.org/x.jpg', $4, $5, 'Someone', 'cc-by-sa-4.0',
         'https://creativecommons.org/licenses/by-sa/4.0', true,
         'Someone · CC BY-SA 4.0 · Wikimedia Commons', $6, $7, $8, $9, $10)`,
      [
        id,
        kind,
        sourceId,
        subjects,
        rank,
        status === 'ready' ? 'LEHV6nWB2yk8' : null,
        JSON.stringify(variants),
        kind === 'video' && status === 'ready' ? `c/media/${id}/1242.webp` : null,
        kind === 'video' ? 8000 : null,
        status,
        source,
      ],
    );
    return id;
  });
}

let hero: string;
let second: string;
let loop: string;

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerEditorialMediaRoute(app, { ...deps, publicBaseUrl: `${BASE}/` }),
  );
  second = await asset('2', ['destination:da-nang'], 1, 'ready');
  hero = await asset('1', ['destination:da-nang', 'poi:dragon-bridge'], 0, 'ready');
  loop = await asset('3', ['destination:da-nang'], 2, 'ready', 'video');
  await asset('4', ['destination:da-nang'], 0, 'pending');
  await asset('5', ['destination:kyoto'], 0, 'ready');
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function media(query: string): Promise<{ status: number; body: MediaListResponse }> {
  const me = await harness.signInAnonymously();
  const response = await harness.request(`/v1/media?${query}`, { headers: { cookie: me.cookie } });
  return { status: response.status, body: (await response.json()) as MediaListResponse };
}

describe('GET /v1/media', () => {
  it('lists the ready assets of a subject, hero first, with public URLs', async () => {
    const { status, body } = await media('subjects=destination:da-nang');
    expect(status).toBe(200);
    expect(body.items.map((i) => i.id)).toEqual([hero, second, loop]);
    const first = body.items[0]!;
    expect(first.subjects).toEqual(['destination:da-nang']);
    expect(first.images.map((i) => i.w)).toEqual([480, 1242]);
    expect(first.images[0]!.url).toBe(`${BASE}/c/media/${hero}/480.webp`);
    expect(first.videos).toEqual([]);
    expect(first).toMatchObject({
      credit: 'Someone · CC BY-SA 4.0 · Wikimedia Commons',
      attribution_required: true,
      licence: 'cc-by-sa-4.0',
      blurhash: 'LEHV6nWB2yk8',
    });
    expect(body.items[2]!.videos).toEqual([
      { url: `${BASE}/c/media/${loop}/720.mp4`, w: 720, h: 406, bytes: 900_000 },
    ]);
  });

  it('answers several subjects at once and never another subject', async () => {
    const { body } = await media('subjects=poi:dragon-bridge,destination:kyoto');
    expect(body.items).toHaveLength(2);
    expect(body.items.find((i) => i.id === hero)?.subjects).toEqual(['poi:dragon-bridge']);
  });

  it('answers an unknown subject with an empty list', async () => {
    expect((await media('subjects=destination:nowhere')).body.items).toEqual([]);
  });

  it('refuses a malformed subject list', async () => {
    expect((await media('subjects=Da%20Nang')).status).toBe(422);
    expect((await media('')).status).toBe(422);
  });

  describe('a place with kept Foursquare photos', () => {
    let withCommons: string;
    let withoutCommons: string;
    let commons: string;
    let stock: string;
    let otherStock: string;

    beforeAll(async () => {
      [withCommons, withoutCommons] = await withSystem(harness.pool, async (tx) => {
        const { rows: destinations } = await tx.query<{ id: string }>(
          "INSERT INTO destinations (slug, name, coverage) VALUES ('hoi-an', 'Hội An', 'live') RETURNING id",
        );
        const ids: string[] = [];
        for (const name of ['Japanese Bridge', 'Lantern stall']) {
          const { rows } = await tx.query<{ id: string }>(
            `INSERT INTO pois (destination_id, name, category, lat, lng)
             VALUES ($1, $2, 'other', 15.877, 108.326) RETURNING id`,
            [destinations[0]!.id, name],
          );
          ids.push(rows[0]!.id);
          await replacePoiFoursquarePhotos(
            tx,
            rows[0]!.id,
            ['first', 'second'].map((photoId) => ({
              photoId: `${name}-${photoId}`,
              prefix: 'https://fastly.4sqi.net/img/general/',
              suffix: `/${photoId}.jpg`,
              width: 1440,
              height: 1920,
              createdAt: null,
            })),
          );
        }
        return ids as [string, string];
      });
      stock = await asset('10', [`poi:${withCommons}`], 0, 'ready', 'photo', 'pexels');
      commons = await asset('11', [`poi:${withCommons}`], 1, 'ready');
      otherStock = await asset('12', [`poi:${withoutCommons}`], 0, 'ready', 'photo', 'pexels');
    });

    it('never shows them to a build that did not ask, and leads with the place itself', async () => {
      const { body } = await media(`subjects=poi:${withCommons},poi:${withoutCommons}`);
      expect(body.items.map((i) => i.id)).toEqual([commons, stock, otherStock]);
    });

    it('adds them when asked, between the Commons photo and generic stock, with the credit', async () => {
      const subjects = `poi:${withCommons},poi:${withoutCommons}`;
      const { body } = await media(`subjects=${subjects}&include=foursquare`);
      const items = placeMediaListResponseSchema.parse(body).items;
      const of = (poiId: string) =>
        items.filter((i) => i.subjects.includes(`poi:${poiId}`)).map((i) => i.source);
      expect(of(withCommons)).toEqual(['wikimedia', 'foursquare', 'foursquare', 'pexels']);
      expect(of(withoutCommons)).toEqual(['foursquare', 'foursquare', 'pexels']);

      const first = items.find((i) => i.subjects.includes(`poi:${withoutCommons}`))!;
      expect(first).toMatchObject({
        kind: 'photo',
        rank: 0,
        credit: 'Powered by Foursquare',
        attribution_required: true,
        source_url: 'https://foursquare.com',
        videos: [],
      });
      expect(first.images).toEqual([
        { url: 'https://fastly.4sqi.net/img/general/320x427/first.jpg', w: 320, h: 427 },
        { url: 'https://fastly.4sqi.net/img/general/640x853/first.jpg', w: 640, h: 853 },
        { url: 'https://fastly.4sqi.net/img/general/810x1080/first.jpg', w: 810, h: 1080 },
      ]);
    });

    it('leaves a destination read as it was', async () => {
      const { body } = await media('subjects=destination:da-nang&include=foursquare');
      expect(body.items.map((i) => i.id)).toEqual([hero, second, loop]);
    });
  });

  it('needs a session', async () => {
    const response = await harness.request('/v1/media?subjects=destination:da-nang');
    expect(response.status).toBe(401);
  });
});
