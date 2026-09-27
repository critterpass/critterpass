/**
 * Content catalogue boundary: app_user reads catalogue rows only while their release is the
 * published one and never writes them; releases, names and hours proposals have no app_user
 * grant; the catalog stream carries no critter or form name column; the guide reads phrase cards
 * and help articles through llm views only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { idsByTable, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let reviewSetId: string;
let liveSetId: string;

async function insertRelease(
  status: 'review' | 'published',
  key: string,
  kind = 'sets',
): Promise<string> {
  return withSystem(harness.db.pool, async (tx) => {
    const approved = status === 'published';
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
         item_count, approved_by, approved_at)
       VALUES ($6, $1, $2, $2, $3, 'review', repeat('a', 64), '{}', 1, $4, $5) RETURNING id`,
      [
        status === 'published' ? 1 : 2,
        key,
        status,
        approved ? harness.fixture.actors.organiser : null,
        approved ? new Date() : null,
        kind,
      ],
    );
    return rows[0]!.id;
  });
}

async function insertSet(code: string, release: string): Promise<string> {
  return withSystem(harness.db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
         hero_critter_key, month_hints, release_id)
       VALUES ($1, $1, 'PE', 3, 'America/Lima', 'PEN', '{es}', 'guest', 'cp-145', '[]', $2) RETURNING id`,
      [code, release],
    );
    return rows[0]!.id;
  });
}

beforeAll(async () => {
  harness = await startStreamHarness();
  liveSetId = await insertSet('pe', await insertRelease('published', 'sets-live'));
  reviewSetId = await insertSet('px', await insertRelease('review', 'sets-review'));
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const asMember = <T>(fn: Parameters<typeof withUser<T>>[3]) =>
  withUser(harness.db.pool, harness.fixture.actors.member, 'device-1', fn);

describe('content catalogue as app_user', () => {
  it('reads rows of the published release and never rows of a release under review', async () => {
    const { rows } = await asMember((tx) =>
      tx.query<{ id: string }>('SELECT id FROM critter_sets WHERE id = ANY($1)', [
        [liveSetId, reviewSetId],
      ]),
    );
    expect(rows.map((row) => row.id)).toEqual([liveSetId]);
  });

  it('cannot write catalogue rows', async () => {
    await expect(
      asMember((tx) => tx.query("UPDATE critter_sets SET name = 'x' WHERE id = $1", [liveSetId])),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asMember((tx) =>
        tx.query(
          "INSERT INTO phrase_cards (key, language, context, text, gloss, audio_status, release_id) VALUES ('x', 'en', 'greetings', 'x', 'x', 'pending', $1)",
          [liveSetId],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('has no access to releases, names or hours proposals', async () => {
    for (const table of ['content_releases', 'critter_names', 'poi_hours_proposals']) {
      await expect(
        asMember((tx) => tx.query(`SELECT 1 FROM ${table} LIMIT 1`)),
        table,
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('refuses an emergency phrase card that no native speaker has reviewed', async () => {
    const release = await insertRelease('published', 'phrases-live', 'phrases');
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO phrase_cards (key, language, context, text, gloss, audio_status, release_id)
           VALUES ('id:emergency:doctor', 'id', 'emergency', 'Saya butuh dokter.', 'I need a doctor.', 'pending', $1)`,
          [release],
        ),
      ),
    ).rejects.toThrow(/phrase_cards_native_review_check/u);
  });
});

describe('catalog stream', () => {
  it('syncs the live catalogue but no critter or form name column', async () => {
    const rows = await harness.rows('catalog', 'member');
    expect(idsByTable(rows)['critter_sets']).toContain(liveSetId);
    for (const table of ['critters', 'critter_forms', 'legendary_windows']) {
      const sample = rows.get(table)?.[0];
      expect(sample, table).toBeDefined();
      expect(Object.keys(sample ?? {}).filter((column) => column.includes('name'))).toEqual([]);
    }
    const published = await harness.db.pool.query<{ tablename: string }>(
      "SELECT tablename FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename IN ('critter_names', 'content_releases')",
    );
    expect(published.rows).toEqual([]);
  });

  it('serves help articles per locale', async () => {
    const rows = await harness.rows('help', 'anonymous', { locale: 'en' });
    expect(rows.get('help_articles')?.map((row) => row['slug'])).toContain('matrix-probe');
    expect(Object.keys(rows.get('help_articles')?.[0] ?? {})).not.toContain('embedding');
  });
});

describe('guide_reader', () => {
  it('reads phrase cards and help articles through llm views only', async () => {
    const { actors, tripId } = harness.fixture;
    const phrases = await withGuideReader(harness.db.pool, actors.member, tripId, (tx) =>
      tx.query<{ key: string }>('SELECT key FROM llm.phrase_cards'),
    );
    expect(phrases.rows.map((row) => row.key)).toContain('en:greetings:hello');
    const help = await withGuideReader(harness.db.pool, actors.member, tripId, (tx) =>
      tx.query<{ slug: string }>('SELECT slug FROM llm.help_articles'),
    );
    expect(help.rows.map((row) => row.slug)).toContain('matrix-probe');
    await expect(
      withGuideReader(harness.db.pool, actors.member, tripId, (tx) =>
        tx.query('SELECT 1 FROM critter_names'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
