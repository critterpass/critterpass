/**
 * `GET /v1/public/locals/{slug}` against the real stack: a place with live critters answers the
 * place, its credited photo and one unnamed silhouette per critter (a rarity tier and a body
 * shape), and nothing that names a critter, draws it, describes it or says where it turns up. An
 * unknown place, a day-trip area and a place whose critters are not released answer 404.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPublicPreviewRoutes } from '../../src/routes/public-previews';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';

const MEDIA = 'https://media.example.test';

let harness: CommandDoorsHarness;

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerPublicPreviewRoutes(app, { ...deps, mediaPublicBaseUrl: `${MEDIA}/` }),
  );
  const one = async (sql: string, params: unknown[] = []) =>
    (await harness.pool.query<{ id: string }>(sql, params)).rows[0]!.id;
  const approver = await one(
    "INSERT INTO users (id, status, display_name) VALUES (uuidv7(), 'registered', 'Ops') RETURNING id",
  );
  const release = (kind: string, status: string) =>
    one(
      `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum,
         artifact, item_count, approved_by, approved_at)
       VALUES ($1, 1, $2, 'locals', $3, 'publish', repeat('a', 64), '{}', 1, $4, now())
       RETURNING id`,
      [kind, `locals-${kind}-${status}`, status, approver],
    );
  const live = await release('critters', 'published');
  const old = await release('sets', 'superseded');
  const set = (code: string, name: string, releaseId: string) =>
    one(
      `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
         hero_critter_key, month_hints, release_id)
       VALUES ($1, $2, 'JP', 2, 'Asia/Tokyo', 'JPY', '{ja}', 'live', 'cp-901', '[]', $3)
       RETURNING id`,
      [code, name, releaseId],
    );
  const japan = await set('jp', 'Japan', live);
  const retired = await set('zz', 'Nowhere', old);
  const place = (slug: string, name: string, setId: string | null, coverage = 'live') =>
    harness.pool.query(
      `INSERT INTO destinations (slug, name, coverage, critter_set_id, critter_key)
       VALUES ($1, $2, $3, $4, 'cp-901')`,
      [slug, name, coverage, setId],
    );
  await place('jp-kyoto', 'Kyoto', japan);
  await place('jp-arashiyama', 'Arashiyama', japan, 'area');
  await place('zz-nowhere', 'Nowhere', retired);
  await place('xx-empty', 'Empty', null);
  const critter = (no: number, setId: string, art: object, releaseId: string) =>
    one(
      `INSERT INTO critters (key, set_id, no, city, species, art_params, canonical_seed, note, release_id)
       VALUES ($1, $2, $3, 'Kyoto', 'Tanuki', $4, 7, 'Keeps odd hours near the shrine.', $5)
       RETURNING id`,
      [`cp-${no}`, setId, no, JSON.stringify(art), releaseId],
    );
  const tanuki = await critter(
    901,
    japan,
    { b: 'sit', c: ['#aa8855', '#553311', '#ffeecc'] },
    live,
  );
  await critter(902, japan, { b: 'bird', c: ['#ffffff', '#222222', '#eeeeee'] }, live);
  await critter(903, japan, { k: 'gecko' }, live);
  await critter(904, retired, { b: 'frog', c: ['#00aa00', '#005500', '#ccffcc'] }, old);
  const form = (key: string, rarity: string) =>
    one(
      `INSERT INTO critter_forms (key, critter_id, rarity, palette, edge, note, requirement_copy, xp, release_id)
       VALUES ($1, $2, $3, '{"f":"#ff00aa"}', 'none', 'Blossom week only.', 'Under the blossoms after dark', 150, $4)
       RETURNING id`,
      [key, tanuki, rarity, live],
    );
  await form('cp-901:rare', 'rare');
  const legendary = await form('cp-901:legendary', 'legendary');
  await harness.pool.query(
    `INSERT INTO critter_names (critter_id, form_id, locale, name, name_native, release_id)
     VALUES ($1, NULL, 'en', 'Pon', 'ポン', $3), ($1, $2, 'en', 'Sakura Pon', NULL, $3)`,
    [tanuki, legendary, live],
  );
  await harness.pool.query(
    `INSERT INTO spawn_rules (key, form_id, kind, set_id, geofences, copy, release_id)
     VALUES ('cp-901:legendary:presence', $1, 'presence', $2,
       '[{"lat":35.0116,"lng":135.7681,"radius_m":250}]', 'By the Kamo river', $3)`,
    [legendary, japan, live],
  );
  const photo = (sourceId: string, rank: number, status: string) =>
    harness.pool.query(
      `INSERT INTO media_assets (kind, source, source_id, source_url, download_url, subject_keys,
         rank, author, licence, licence_url, attribution_required, credit, blurhash, variants, status)
       VALUES ('photo', 'wikimedia', $1, $2, 'https://upload.example.org/original.jpg',
         '{destination:jp-kyoto}', $3, 'Aiko T.', 'cc-by-sa-4.0',
         'https://creativecommons.org/licenses/by-sa/4.0/', true, $4, 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
         $5, $6)`,
      [
        sourceId,
        `https://commons.example.org/${sourceId}`,
        rank,
        `Aiko T. · CC BY-SA 4.0 · Wikimedia Commons (${sourceId})`,
        JSON.stringify([
          { key: `c/media/${sourceId}/480.webp`, format: 'webp', w: 480, h: 320, bytes: 1 },
          { key: `c/media/${sourceId}/1280.webp`, format: 'webp', w: 1280, h: 853, bytes: 2 },
          { key: `c/media/${sourceId}/2560.webp`, format: 'webp', w: 2560, h: 1707, bytes: 3 },
        ]),
        status,
      ],
    );
  await photo('second', 1, 'ready');
  await photo('hero', 0, 'ready');
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const get = (path: string) => harness.request(path, { headers: { 'x-real-ip': '198.51.100.9' } });

describe('GET /v1/public/locals/{slug}', () => {
  it('answers the place, its hero photo with credit and one silhouette per critter', async () => {
    const response = await get('/v1/public/locals/jp-kyoto');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=300');
    expect(await response.json()).toEqual({
      kind: 'locals',
      slug: 'jp-kyoto',
      name: 'Kyoto',
      area: 'Japan',
      photo: {
        url: `${MEDIA}/c/media/hero/1280.webp`,
        width: 1280,
        height: 853,
        credit: 'Aiko T. · CC BY-SA 4.0 · Wikimedia Commons (hero)',
        source_url: 'https://commons.example.org/hero',
      },
      count: 3,
      critters: [
        { rarity: 'legendary', silhouette: 'sit' },
        { rarity: 'common', silhouette: 'bird' },
        { rarity: 'common', silhouette: 'sit' },
      ],
    });
  });

  it('never names a critter, draws it, describes it or says where it turns up', async () => {
    const body = await (await get('/v1/public/locals/jp-kyoto')).text();
    for (const secret of [
      'Pon',
      'ポン',
      'Tanuki',
      'cp-90',
      'gecko',
      '#aa8855',
      '#ff00aa',
      'odd hours',
      'Blossom',
      'blossoms',
      'Kamo',
      '35.0116',
      'radius',
    ]) {
      expect(body).not.toContain(secret);
    }
  });

  it('answers 404 for an unknown place, a day-trip area, unreleased critters and no critters', async () => {
    for (const slug of ['jp-osaka', 'jp-arashiyama', 'zz-nowhere', 'xx-empty', 'Not_A_Slug']) {
      expect((await get(`/v1/public/locals/${slug}`)).status).toBe(404);
    }
  });

  it('leaves the link previews beside it answering', async () => {
    expect((await get('/v1/public/plan/not-a-token')).status).toBe(404);
  });
});
