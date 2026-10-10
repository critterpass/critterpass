/**
 * Crew chat sticker rows (`messages.type = 'sticker'`): an active member inserts a sticker only for
 * a critter form they have met (a collection entry of theirs) and only in the sticker
 * shape; a member's row never carries a card reference, and a member who has not met the form, or
 * an outsider, cannot post it.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { buildPermissionFixture, type PermissionFixture } from '../helpers/fixtures';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PermissionFixture;
let formId: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
  await withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string; critter_id: string }>(
      "SELECT id, critter_id FROM critter_forms WHERE key = 'cp-999:legendary'",
    );
    const form = rows[0]!;
    formId = form.id;
    await tx.query(
      `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, source)
       VALUES ($1, $2, $3, now(), 'encounter'), ($4, $2, $3, now(), 'encounter')`,
      [fixture.actors.member, form.id, form.critter_id, fixture.actors.outsider],
    );
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

function insert(
  uid: string,
  type: string,
  body: string,
  refKind: string | null,
  refId: string | null,
) {
  return withUser(db.pool, uid, randomUUID(), (tx) =>
    tx.query(
      `INSERT INTO messages (crew_id, sender_kind, sender_id, type, body, ref_kind, ref_id)
       VALUES ($1, 'user', $2, $3, $4, $5, $6)`,
      [fixture.crewId, uid, type, body, refKind, refId],
    ),
  );
}

describe('sticker messages', () => {
  it('lets a member who met the form post it as a sticker', async () => {
    await expect(
      insert(fixture.actors.member, 'sticker', 'cheer', 'critter_form', formId),
    ).resolves.toMatchObject({ rowCount: 1 });
  });

  it('refuses a member who has not met the form, and an outsider who has', async () => {
    for (const uid of [fixture.actors.organiser, fixture.actors.outsider]) {
      await expect(insert(uid, 'sticker', 'cheer', 'critter_form', formId)).rejects.toThrow(
        /row-level security/i,
      );
    }
  });

  it('refuses a sticker without its form or pose, and a card reference on a member row', async () => {
    const { member } = fixture.actors;
    await expect(insert(member, 'sticker', 'dance', 'critter_form', formId)).rejects.toThrow(
      /messages_sticker_shape/,
    );
    await expect(insert(member, 'sticker', 'cheer', null, null)).rejects.toThrow();
    await expect(insert(member, 'text', 'hi', 'poll', randomUUID())).rejects.toThrow(
      /row-level security/i,
    );
  });
});
