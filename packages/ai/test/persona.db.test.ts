/**
 * The persona loader against a real, migrated Postgres, reading through llm.persona_packs as
 * `guide_reader`: the latest approved release wins, a newer draft never does.
 */
// The gateway never imports @cp/db; only this suite borrows its migrations, role-scoped
// transactions and Testcontainers harness to read the real view.
// eslint-disable-next-line boundaries/dependencies -- see the comment above
import { runMigrations, withGuideReader, withSystem } from '@cp/db';
// eslint-disable-next-line boundaries/dependencies -- see the comment above
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  LATEST_APPROVED_PERSONA_SQL,
  loadPersonaPack,
  REPO_PACKS,
  type ApprovedPersonaRow,
  type PersonaReleaseSource,
} from '../src';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;

const readerSource: PersonaReleaseSource = async (slug) => {
  const { rows } = await withGuideReader(pool, crypto.randomUUID(), crypto.randomUUID(), (tx) =>
    tx.query<ApprovedPersonaRow>(LATEST_APPROVED_PERSONA_SQL, [slug]),
  );
  return rows[0] ?? null;
};

beforeAll(async () => {
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 4 });
  await runMigrations(pool);
  const {
    local_words,
    voice_id: _voice,
    id: _id,
    version: _v,
    status: _s,
    ...style
  } = REPO_PACKS.pon;
  await withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO guides (slug, name, colour) VALUES ('pon', 'Pon', 'orange') RETURNING id",
    );
    const insert = `INSERT INTO persona_packs
      (guide_id, version, status, approved_at, style, lexicon, voice_settings)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`;
    const lexicon = { local_words };
    await tx.query(insert, [
      rows[0]!.id,
      '1.0.0',
      'approved',
      '2026-09-01T00:00:00Z',
      style,
      lexicon,
      { voice_id: 'pon-v1' },
    ]);
    await tx.query(insert, [
      rows[0]!.id,
      '1.1.0',
      'approved',
      '2026-09-20T00:00:00Z',
      style,
      lexicon,
      { voice_id: 'pon-v2' },
    ]);
    await tx.query(insert, [rows[0]!.id, '2.0.0-draft', 'draft', null, style, lexicon, {}]);
  });
}, 240_000);

afterAll(async () => {
  await pool.end();
  await postgres.stop();
});

describe('loadPersonaPack through llm.persona_packs', () => {
  it('uses the latest approved release, never a newer draft', async () => {
    const loaded = await loadPersonaPack('pon', readerSource);
    expect(loaded.origin).toBe('release');
    expect(loaded.pack).toMatchObject({ version: '1.1.0', status: 'approved', voice_id: 'pon-v2' });
    expect(loaded.pack.local_words).toEqual(REPO_PACKS.pon.local_words);
  });

  it('falls back to the repo pack for a guide with no release', async () => {
    expect(await loadPersonaPack('lundi', readerSource)).toEqual({
      pack: REPO_PACKS.lundi,
      origin: 'repo',
    });
  });
});
