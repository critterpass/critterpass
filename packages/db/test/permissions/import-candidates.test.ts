/**
 * `import_candidates` (C2): a paste or scan is its owner's (synced on `me`); a forward to the crew
 * address is the crew's to resolve (synced on `crews`); a mailbox find reaches the crew only while
 * its owner consents to surfacing it. The server writes.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const bySource = 'SELECT 1 FROM import_candidates WHERE source = $1';

describe('import candidates', () => {
  it("keeps a member's own paste to them", async () => {
    const { actors } = harness.fixture;
    expect(await visibleRows(harness, actors.organiser, bySource, ['paste'])).toBe(1);
    for (const kind of ['coOrganiser', 'member', 'outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], bySource, ['paste']), kind).toBe(0);
    }
    const own = (await harness.rows('me', 'organiser')).get('import_candidates') ?? [];
    expect(own.map((row) => row['source']).sort()).toEqual(['forward', 'paste']);
  });

  it('shows a forward to the crew address to the whole crew', async () => {
    const { actors } = harness.fixture;
    for (const kind of ['organiser', 'coOrganiser', 'member'] as const) {
      expect(await visibleRows(harness, actors[kind], bySource, ['forward']), kind).toBe(1);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], bySource, ['forward']), kind).toBe(0);
    }
  });

  it('surfaces a mailbox find to the crew only while its owner consents', async () => {
    const { actors } = harness.fixture;
    expect(await visibleRows(harness, actors.member, bySource, ['mailbox'])).toBe(1);
    expect(await visibleRows(harness, actors.organiser, bySource, ['mailbox'])).toBe(0);
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        `INSERT INTO consents (user_id, purpose, granted_at) VALUES ($1, 'mailbox_surfacing', now())
         ON CONFLICT (user_id, purpose) DO UPDATE SET granted_at = now(), revoked_at = NULL`,
        [actors.member],
      ),
    );
    expect(await visibleRows(harness, actors.organiser, bySource, ['mailbox'])).toBe(1);
    expect(await visibleRows(harness, actors.outsider, bySource, ['mailbox'])).toBe(0);
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        "UPDATE consents SET revoked_at = now() WHERE user_id = $1 AND purpose = 'mailbox_surfacing'",
        [actors.member],
      ),
    );
    expect(await visibleRows(harness, actors.organiser, bySource, ['mailbox'])).toBe(0);
  });

  it('syncs crew-visible candidates to active members only', async () => {
    for (const kind of ['member', 'organiser'] as const) {
      const rows = (await harness.rows('crews', kind)).get('import_candidates') ?? [];
      expect(rows.length, kind).toBeGreaterThan(0);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect((await harness.rows('crews', kind)).get('import_candidates') ?? [], kind).toHaveLength(
        0,
      );
    }
  });

  it('refuses direct writes', async () => {
    const { actors } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query("UPDATE import_candidates SET status = 'accepted' WHERE user_id = $1", [
          actors.organiser,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
