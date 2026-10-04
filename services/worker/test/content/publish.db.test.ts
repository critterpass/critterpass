import { randomUUID } from 'node:crypto';

import { buildRelease, currentRelease, type ContentItem, type ContentKind } from '@cp/content';
import { REPO_PACKS } from '@cp/ai';
import { withSystem } from '@cp/db';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { enqueue } from '../../src/boss';
import { contentJobs, publishRelease } from '../../src/content';
import { contentPublishJob } from '../../src/content/publish';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
const owner = randomUUID();
const at = '2026-09-28T00:00:00.000Z';

beforeAll(async () => {
  harness = await startJobsHarness();
  await harness.pool.query(
    "INSERT INTO destinations (slug, name, coverage, tz) VALUES ('bali', 'Bali', 'live', 'Asia/Makassar')",
  );
}, 240_000);

afterEach(() => harness.stopAll());
afterAll(() => harness?.close());

async function approved<K extends ContentKind>(
  kind: K,
  version: number,
  items: readonly ContentItem<K>[],
  tamper?: (artifact: { items: unknown[] }) => void,
): Promise<string> {
  const artifact = buildRelease({
    kind,
    version,
    items,
    generated_by: { batch_key: `${kind}-${version}`, route: null, model: null, generated_at: at },
    approved_by: owner,
  });
  const raw = structuredClone(artifact) as unknown as { items: unknown[] };
  tamper?.(raw);
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact, item_count,
       approved_by, approved_at)
     VALUES ($1, $2, $3, $3, 'approved', 'approve', $4, $5, $6, $7, now()) RETURNING id`,
    [
      kind,
      version,
      `${kind}-${version}-${randomUUID()}`,
      artifact.checksum,
      JSON.stringify(raw),
      items.length,
      owner,
    ],
  );
  return rows[0]!.id;
}

const indonesia = (name: string): ContentItem<'sets'> => ({
  code: 'id',
  name,
  country: 'ID',
  rank: 28,
  set_group: 2,
  tz: 'Asia/Makassar',
  currency: 'IDR',
  languages: ['id'],
  coverage: 'live',
  guide: 'tokek',
  destination: 'bali',
  hero_critter_id: 'cp-112',
  critter_ids: ['cp-111', 'cp-112', 'cp-113'],
  month_hints: Array.from({ length: 12 }, () => ({ crowd: 50, note: null })),
});

const tokek: ContentItem<'critters'> = {
  id: 'cp-112',
  no: 112,
  set_code: 'id',
  city: 'Bali',
  species: 'Tokay gecko',
  name: 'Tokek',
  name_native: null,
  art_params: { k: 'gecko' },
  canonical_seed: 7,
  note: 'Loud at night, louder at dawn.',
};

const publish = (id: string) => withSystem(harness.pool, (tx) => publishRelease(tx, id));

async function status(id: string): Promise<{ status: string; blocked_reason: string | null }> {
  const { rows } = await harness.pool.query<{ status: string; blocked_reason: string | null }>(
    'SELECT status, blocked_reason FROM content_releases WHERE id = $1',
    [id],
  );
  return rows[0]!;
}

describe('content.publish', () => {
  it('makes an approved release live and tells clients to refetch', async () => {
    const setsV1 = await approved('sets', 1, [indonesia('Indonesia')]);
    await publish(setsV1);
    await publish(await approved('critters', 1, [tokek]));
    const forms = currentRelease('forms')!.items.filter((f) => f.critter_id === 'cp-112');
    await publish(await approved('forms', 1, forms));
    await publish(
      await approved(
        'windows',
        1,
        currentRelease('windows')!.items.filter((w) => w.form_id.startsWith('cp-112')),
      ),
    );

    const live = await harness.pool.query<{ key: string }>(
      'SELECT key FROM critter_forms ORDER BY key',
    );
    expect(live.rows.map((r) => r.key)).toEqual(['cp-112:epic', 'cp-112:legendary', 'cp-112:rare']);
    const names = await harness.pool.query<{ name: string }>(
      'SELECT name FROM critter_names ORDER BY name',
    );
    expect(names.rows.map((r) => r.name)).toEqual([
      'Epic Tokek',
      'Golden Tokek',
      'Temple Tokek',
      'Tokek',
    ]);
    // A released critter is the guide of its city: its guide row comes with the release.
    const guides = await harness.pool.query(
      'SELECT slug, name, colour, accent FROM guides WHERE critter_key = $1',
      ['cp-112'],
    );
    expect(guides.rows).toEqual([
      { slug: 'tokek', name: 'Tokek', colour: 'yellow', accent: '#ffd84a' },
    ]);
    const window = await harness.pool.query<{ months: number[] }>(
      "SELECT months FROM legendary_windows WHERE key = 'golden-tokek'",
    );
    expect(window.rows[0]?.months).toHaveLength(12);
    expect((await status(setsV1)).status).toBe('published');
    const outbox = await harness.pool.query<{ payload: { content_kind: string } }>(
      "SELECT payload FROM rt_outbox WHERE channel = 'catalog' ORDER BY id",
    );
    expect(outbox.rows.map((r) => r.payload.content_kind)).toEqual([
      'sets',
      'critters',
      'forms',
      'windows',
    ]);
  });

  it('supersedes the previous release and rolls back to it in one swap', async () => {
    const v2 = await approved('sets', 2, [indonesia('Indonesia (renamed)')]);
    await publish(v2);
    const name = async () =>
      (
        await harness.pool.query<{ name: string }>(
          "SELECT name FROM critter_sets WHERE code = 'id'",
        )
      ).rows[0]?.name;
    expect(await name()).toBe('Indonesia (renamed)');
    const v1 = await harness.pool.query<{ id: string; status: string }>(
      "SELECT id, status FROM content_releases WHERE kind = 'sets' AND version = 1",
    );
    expect(v1.rows[0]?.status).toBe('superseded');
    // A rollback re-approves the older release and runs the same publish.
    await harness.pool.query("UPDATE content_releases SET status = 'approved' WHERE id = $1", [
      v1.rows[0]!.id,
    ]);
    await publish(v1.rows[0]!.id);
    expect(await name()).toBe('Indonesia');
    expect((await status(v2)).status).toBe('superseded');
  });

  it('refuses a release whose checksum does not match and never publishes an unapproved one', async () => {
    const tampered = await approved('sets', 3, [indonesia('Indonesia')], (raw) => {
      (raw.items[0] as { name: string }).name = 'Tampered';
    });
    await expect(publish(tampered)).rejects.toThrow(/checksum/u);
    await harness.pool.query(
      "UPDATE content_releases SET status = 'review', approved_by = NULL, approved_at = NULL WHERE id = $1",
      [tampered],
    );
    await expect(publish(tampered)).rejects.toThrow(/not approved/u);
  });

  it('blocks emergency cards without native review and unverified safety records', async () => {
    const card: ContentItem<'phrases'> = {
      id: 'id:emergency:need-a-doctor',
      language: 'id',
      context: 'emergency',
      slug: 'need-a-doctor',
      text: 'Saya butuh dokter.',
      romanisation: null,
      gloss: 'I need a doctor.',
      audio_key: null,
      audio_status: 'pending',
      needs_native_review: true,
      native_reviewed_on: null,
    };
    const phrases = await approved('phrases', 1, [card]);
    const emergency = await approved('emergency', 1, [
      {
        country: 'ID',
        numbers: [{ service: 'general', number: '112', label: 'Ambulance, police, fire' }],
        source_url: 'https://www.kemkes.go.id/',
        retrieved_on: '2026-09-28',
        verified_at: null,
      },
    ]);
    const boss = await harness.startRuntime(contentJobs());
    await enqueue(boss, contentPublishJob(), { release_id: phrases });
    await enqueue(boss, contentPublishJob(), { release_id: emergency });
    for (let i = 0; i < 60; i += 1) {
      if (
        (await status(phrases)).status === 'blocked' &&
        (await status(emergency)).status === 'blocked'
      )
        break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(await status(phrases)).toEqual({
      status: 'blocked',
      blocked_reason:
        "1 phrase cards still need a native speaker's review: id:emergency:need-a-doctor",
    });
    expect((await status(emergency)).blocked_reason).toBe(
      '1 emergency records are not verified yet',
    );
    const cards = await harness.pool.query('SELECT 1 FROM phrase_cards');
    expect(cards.rowCount).toBe(0);
  });

  it('overlays editorial on curated POIs and redirects a decided duplicate', async () => {
    const insert = (source: string, id: string, name: string) =>
      harness.pool.query(
        `INSERT INTO pois (destination_id, name, category, lat, lng, source_ids)
         SELECT id, $1, 'temple_shrine', -8.8291, 115.0849, jsonb_build_object($2::text, $3::text)
         FROM destinations WHERE slug = 'bali'`,
        [name, source, id],
      );
    await insert('fsq_os', 'uluwatu', 'Pura Luhur Uluwatu');
    await insert('overture', 'uluwatu-en', 'Uluwatu Temple');
    const poi = (ref: string, name: string, mergeInto: string | null): ContentItem<'places'> => {
      const [source, id] = ref.split(':') as ['fsq_os' | 'overture', string];
      return {
        ref,
        destination: 'bali',
        name,
        name_local: null,
        category: 'temple_shrine',
        lat: -8.8291,
        lng: 115.0849,
        address: null,
        tz: 'Asia/Makassar',
        tags: ['temples'],
        hours: null,
        licence: {
          source,
          source_id: id,
          licence: 'Apache-2.0',
          attribution: 'Foursquare Open Source Places',
        },
        editorial: {
          why_go: 'A clifftop temple above the Indian Ocean.',
          best_time: 'Late afternoon',
          time_needed_min: 90,
          crowd_hint: 'Busy at sunset',
          etiquette: 'Wear a sarong; mind the monkeys.',
        },
        merge_into: mergeInto,
        possible_duplicate_of: null,
      };
    };
    await publish(
      await approved('places', 1, [
        poi('fsq_os:uluwatu', 'Pura Luhur Uluwatu', null),
        poi('overture:uluwatu-en', 'Uluwatu Temple', 'fsq_os:uluwatu'),
      ]),
    );
    const { rows } = await harness.pool.query<{
      name: string;
      curation: string;
      merged: boolean;
      why: string;
    }>(
      `SELECT name, curation, merged_into_id IS NOT NULL AS merged, editorial ->> 'why_go' AS why
       FROM pois ORDER BY name`,
    );
    expect(rows).toEqual([
      {
        name: 'Pura Luhur Uluwatu',
        curation: 'editorial',
        merged: false,
        why: 'A clifftop temple above the Indian Ocean.',
      },
      {
        name: 'Uluwatu Temple',
        curation: 'editorial',
        merged: true,
        why: 'A clifftop temple above the Indian Ocean.',
      },
    ]);
  });

  it('publishes persona packs for live guides, read back through the persona loader shape', async () => {
    await harness.pool.query(
      "INSERT INTO guides (slug, name, colour) VALUES ('tokek', 'Tokek', 'yellow') ON CONFLICT (slug) DO NOTHING",
    );
    const pack = { ...REPO_PACKS.tokek, version: 'content-test', status: 'draft' };
    const item: ContentItem<'personas'> = {
      id: 'tokek',
      pack,
      ai_disclosure: 'I’m an AI guide and can be wrong.',
      fixtures: [{ prompt: 'Hi', expect_any: ['hi'], forbid: [] }],
    };
    const guest: ContentItem<'personas'> = { ...item, id: 'guest', pack: { ...REPO_PACKS.guest } };
    await publish(await approved('personas', 1, [item, guest]));
    const { rows } = await harness.pool.query<{
      version: string;
      status: string;
      lexicon: { local_words: unknown[] };
    }>('SELECT version, status, lexicon FROM persona_packs');
    expect(rows).toEqual([
      {
        version: 'content-v1',
        status: 'approved',
        lexicon: { local_words: REPO_PACKS.tokek.local_words },
      },
    ]);
  });
});
