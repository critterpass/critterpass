/**
 * `ops.vendor_threads` and `ops.vendor_messages` (RLS class S, C2): no app role reads or writes
 * them (the traveller's cards come through the api), the ops console reads them, and the database
 * itself refuses to mark a message approved or sent unless its requester approved this exact text,
 * and refuses to edit a text once approved.
 */
import { createHash, randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { asRole } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let threadId: string;

const TEXT = 'Could you hold a table for 6 at 21:00 tonight?';
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

beforeAll(async () => {
  harness = await startStreamHarness();
  const { actors, tripId } = harness.fixture;
  threadId = await withSystem(harness.db.pool, async (tx) => {
    const poi = await tx.query<{ id: string }>('SELECT id FROM pois ORDER BY created_at LIMIT 1');
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO ops.vendor_threads (trip_id, requested_by, poi_id, vendor_name, channel)
       VALUES ($1, $2, $3, 'Locavore', 'whatsapp_business') RETURNING id`,
      [tripId, actors.organiser, poi.rows[0]!.id],
    );
    return rows[0]!.id;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function draft(body = TEXT): Promise<string> {
  const id = randomUUID();
  await withSystem(harness.db.pool, (tx) =>
    tx.query(
      `INSERT INTO ops.vendor_messages (id, thread_id, trip_id, direction, body, status)
       VALUES ($1, $2, $3, 'outbound', $4, 'draft')`,
      [id, threadId, harness.fixture.tripId, body],
    ),
  );
  return id;
}

async function approve(id: string, shown: string, hashOf = shown): Promise<void> {
  const { actors } = harness.fixture;
  await withSystem(harness.db.pool, async (tx) => {
    const approval = randomUUID();
    await tx.query(
      `INSERT INTO ops.approvals (id, user_id, subject_kind, subject_id, text_shown)
       VALUES ($1, $2, 'vendor_message', $3, $4)`,
      [approval, actors.organiser, id, shown],
    );
    await tx.query(
      `UPDATE ops.vendor_messages SET status = 'approved', approved_by_user_id = $2,
         approved_at = now(), approval_id = $3, approved_text_sha256 = $4 WHERE id = $1`,
      [id, actors.organiser, approval, sha(hashOf)],
    );
  });
}

const markSent = (id: string) =>
  withSystem(harness.db.pool, (tx) =>
    tx.query(`UPDATE ops.vendor_messages SET status = 'sent', sent_at = now() WHERE id = $1`, [id]),
  );

describe('ops vendor messaging', () => {
  it('is unreadable and unwritable by every app role, and readable by the ops console', async () => {
    const { actors, tripId } = harness.fixture;
    await draft();
    for (const uid of [actors.organiser, actors.member, actors.outsider]) {
      for (const table of ['ops.vendor_threads', 'ops.vendor_messages']) {
        await expect(
          withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query(`SELECT 1 FROM ${table}`)),
        ).rejects.toThrow(/permission denied/i);
      }
      await expect(
        withUser(harness.db.pool, uid, randomUUID(), (tx) =>
          tx.query(
            `INSERT INTO ops.vendor_messages (thread_id, trip_id, direction, body, status)
             VALUES ($1, $2, 'inbound', 'x', 'received')`,
            [threadId, tripId],
          ),
        ),
      ).rejects.toThrow(/permission denied/i);
    }
    const read = await asRole(harness.db.pool, 'admin_reader', 'SELECT 1 FROM ops.vendor_messages');
    expect(read.rowCount).toBeGreaterThan(0);
    const published = await harness.db.pool.query(
      "SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename LIKE 'vendor_%'",
    );
    expect(published.rows).toHaveLength(0);
  });

  it('sends only a text its requester approved word for word', async () => {
    const unapproved = await draft();
    await expect(markSent(unapproved)).rejects.toThrow(/not approved/);

    const approved = await draft();
    await approve(approved, TEXT);
    await markSent(approved);

    const shownOther = await draft();
    await expect(approve(shownOther, `${TEXT} `, TEXT)).rejects.toThrow(/not approved/);

    const wrongHash = await draft();
    await expect(approve(wrongHash, TEXT, `${TEXT}!`)).rejects.toThrow(/not approved/);
  });

  it('refuses to edit a text once approved', async () => {
    const id = await draft();
    await approve(id, TEXT);
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(`UPDATE ops.vendor_messages SET body = $2 WHERE id = $1`, [id, `${TEXT} Thanks!`]),
      ),
    ).rejects.toThrow(/cannot be edited/);
  });
});
