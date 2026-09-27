import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import { ACTOR_KINDS, buildPermissionFixture, type PermissionFixture } from '../helpers/fixtures';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PermissionFixture;

const INSERT_PACK = `INSERT INTO persona_packs (guide_id, version, status, approved_at)
  SELECT id, $1, $2, $3 FROM guides WHERE slug = 'matrix-probe-guide'`;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('persona_packs: RLS class S, read by the guide through llm.persona_packs', () => {
  it.each(ACTOR_KINDS)('denies the %s any direct read', async (actor) => {
    await expect(
      withUser(db.pool, fixture.actors[actor], anonymousActor().device, (tx) =>
        tx.query('SELECT 1 FROM persona_packs'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('denies guide_reader the base table', async () => {
    await expect(
      withGuideReader(db.pool, fixture.actors.member, fixture.tripId, (tx) =>
        tx.query('SELECT 1 FROM persona_packs'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets app_system publish a draft and then approve it', async () => {
    await withSystem(db.pool, async (tx) => {
      await tx.query(INSERT_PACK, ['0.2.0', 'draft', null]);
      await tx.query(
        "UPDATE persona_packs SET status = 'approved', approved_at = now() WHERE version = '0.2.0'",
      );
    });
    const rows = await withGuideReader(db.pool, fixture.actors.member, fixture.tripId, (tx) =>
      tx.query<{ version: string }>(
        "SELECT version FROM llm.persona_packs WHERE version = '0.2.0'",
      ),
    );
    expect(rows.rows).toEqual([{ version: '0.2.0' }]);
  });

  it('refuses an approved pack without an approval time', async () => {
    await expect(
      withSystem(db.pool, (tx) => tx.query(INSERT_PACK, ['0.3.0', 'approved', null])),
    ).rejects.toThrow(/persona_packs_approved_at_check/);
  });

  it('keeps one row per guide and version', async () => {
    await expect(
      withSystem(db.pool, (tx) => tx.query(INSERT_PACK, ['matrix-probe', 'draft', null])),
    ).rejects.toThrow(/persona_packs_guide_version_key/);
  });
});
