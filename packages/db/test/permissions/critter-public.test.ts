/**
 * Names stay server-side until found: `critter_names` is readable by no client-facing role and no
 * replication role, and `app.set_collected_name` copies a found form's names into the caller's own
 * collection entry only, and only once that entry is verified.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let alice: string;
let bob: string;
let formId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  ({ alice, bob, formId } = await withSystem(db.pool, async (tx) => {
    const a = await insertUser(tx, { username: 'alice' });
    const b = await insertUser(tx, { username: 'bob' });
    const { rows: release } = await tx.query<{ id: string }>(
      `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
         item_count, approved_by, approved_at)
       VALUES ('critters', 1, 'names', 'names', 'published', 'publish', repeat('b', 64), '{}', 1, $1, now())
       RETURNING id`,
      [a],
    );
    const releaseId = release[0]!.id;
    const { rows: set } = await tx.query<{ id: string }>(
      `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
         hero_critter_key, month_hints, release_id)
       VALUES ('jp', 'Japan', 'JP', 2, 'Asia/Tokyo', 'JPY', '{ja}', 'live', 'cp-061', '[]', $1) RETURNING id`,
      [releaseId],
    );
    const { rows: critter } = await tx.query<{ id: string }>(
      `INSERT INTO critters (key, set_id, no, city, species, art_params, canonical_seed, note, release_id)
       VALUES ('cp-061', $1, 61, 'Kyoto', 'Tanuki', '{"k":"tanuki"}', 7, 'Keeps odd hours.', $2) RETURNING id`,
      [set[0]!.id, releaseId],
    );
    const { rows: form } = await tx.query<{ id: string }>(
      `INSERT INTO critter_forms (key, critter_id, rarity, palette, pose, edge, note, requirement_copy, xp, release_id)
       VALUES ('cp-061:legendary', $1, 'legendary', '{}', 'cheer', 'legendary', 'Blossom week.', 'Under the blossoms after dark', 150, $2)
       RETURNING id`,
      [critter[0]!.id, releaseId],
    );
    await tx.query(
      `INSERT INTO critter_names (critter_id, form_id, locale, name, name_native, release_id)
       VALUES ($1, NULL, 'en', 'Pon', 'ポン', $3), ($1, $2, 'en', 'Sakura Pon', NULL, $3)`,
      [critter[0]!.id, form[0]!.id, releaseId],
    );
    await tx.query(
      `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, source, verification)
       VALUES ($1, $3, $4, now(), 'encounter', 'verified'), ($2, $3, $4, now(), 'encounter', 'verified')`,
      [a, b, form[0]!.id, critter[0]!.id],
    );
    return { alice: a, bob: b, formId: form[0]!.id };
  }));
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

async function namesOf(
  uid: string,
): Promise<{ critter_name: string | null; form_name: string | null }> {
  const { rows } = await db.pool.query<{ critter_name: string | null; form_name: string | null }>(
    'SELECT critter_name, form_name FROM collection_entries WHERE user_id = $1',
    [uid],
  );
  return rows[0]!;
}

describe('critter names', () => {
  it('are unreadable by every client-facing and replication role', async () => {
    const { rows } = await db.pool.query<{ role: string; allowed: boolean }>(
      `SELECT role, has_table_privilege(role, 'critter_names', 'SELECT') AS allowed
       FROM unnest(ARRAY['app_user', 'powersync_repl', 'guide_reader', 'admin_reader']) AS role`,
    );
    expect(rows.filter((row) => row.allowed)).toEqual([]);
    await expect(
      withUser(db.pool, alice, 'device-a', (tx) => tx.query('SELECT name FROM critter_names')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('are copied only into the caller’s own collection entry', async () => {
    const copied = await withUser(db.pool, alice, 'device-a', async (tx) => {
      const { rows } = await tx.query<{ copied: boolean }>(
        'SELECT app.set_collected_name($1) AS copied',
        [formId],
      );
      return rows[0]!.copied;
    });
    expect(copied).toBe(true);
    expect(await namesOf(alice)).toEqual({ critter_name: 'Pon', form_name: 'Sakura Pon' });
    expect(await namesOf(bob)).toEqual({ critter_name: null, form_name: null });
  });

  it('need a signed-in caller', async () => {
    await expect(
      withSystem(db.pool, (tx) => tx.query('SELECT app.set_collected_name($1)', [formId])),
    ).rejects.toThrow(/signed-in caller/u);
  });
});
