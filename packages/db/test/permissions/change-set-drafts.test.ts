/**
 * An unsent change set draft is its author's alone ("ONLY YOU SEE THIS" on a fix, a swap or placed
 * ideas): a person's draft reaches only them, organisers included, whether read directly or through
 * the sync streams; a guide's draft (a swipe match waiting for approval) reaches the trip's
 * organisers. Once sent, the crew sees it as before.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { insertChangeSet } from '../helpers/plan-actors';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let memberDraft: string;
let organiserDraft: string;
let guideDraft: string;

const PROBE = 'SELECT 1 FROM change_sets WHERE id = $1';

async function synced(
  stream: 'trip' | 'trip_draft',
  kind: 'member' | 'organiser' | 'coOrganiser' | 'outsider',
): Promise<unknown[]> {
  const rows = await harness.rows(stream, kind, { trip_id: harness.fixture.tripId });
  return (rows.get('change_sets') ?? []).map((row) => row['id']);
}

beforeAll(async () => {
  harness = await startStreamHarness();
  const { tripId, versionId, actors } = harness.fixture;
  [memberDraft, organiserDraft, guideDraft] = await withSystem(harness.db.pool, async (tx) => {
    const draft = (authorId: string, authorKind: 'user' | 'guide') =>
      insertChangeSet(tx, { tripId, baseVersionId: versionId, authorId, authorKind, ops: [] });
    const guide = await tx.query<{ id: string }>(
      "SELECT id FROM guides WHERE slug = 'matrix-probe-guide'",
    );
    return [
      await draft(actors.member, 'user'),
      await draft(actors.organiser, 'user'),
      await draft(guide.rows[0]!.id, 'guide'),
    ] as const;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('change set drafts', () => {
  it("keep a person's draft to that person, organisers included", async () => {
    const { actors } = harness.fixture;
    expect(await visibleRows(harness, actors.member, PROBE, [memberDraft])).toBe(1);
    for (const kind of ['organiser', 'coOrganiser', 'outsider', 'exMember'] as const) {
      expect(await visibleRows(harness, actors[kind], PROBE, [memberDraft]), kind).toBe(0);
    }
    expect(await visibleRows(harness, actors.organiser, PROBE, [organiserDraft])).toBe(1);
    for (const kind of ['coOrganiser', 'member'] as const) {
      expect(await visibleRows(harness, actors[kind], PROBE, [organiserDraft]), kind).toBe(0);
    }
  });

  it("sync a person's draft to that person alone", async () => {
    expect(await synced('trip', 'member')).toContain(memberDraft);
    expect(await synced('trip', 'organiser')).not.toContain(memberDraft);
    expect(await synced('trip', 'organiser')).toContain(organiserDraft);
    expect(await synced('trip', 'coOrganiser')).not.toContain(organiserDraft);
    for (const kind of ['organiser', 'coOrganiser'] as const) {
      expect(await synced('trip_draft', kind), kind).not.toContain(memberDraft);
    }
  });

  it("bring a guide's draft to the trip's organisers only", async () => {
    const { actors } = harness.fixture;
    for (const kind of ['organiser', 'coOrganiser'] as const) {
      expect(await visibleRows(harness, actors[kind], PROBE, [guideDraft]), kind).toBe(1);
      expect(await synced('trip_draft', kind), kind).toContain(guideDraft);
    }
    expect(await visibleRows(harness, actors.member, PROBE, [guideDraft])).toBe(0);
    expect(await synced('trip', 'member')).not.toContain(guideDraft);
    expect(await synced('trip_draft', 'member')).toEqual([]);
  });

  it('reach the crew once their author sends them', async () => {
    const { actors } = harness.fixture;
    await withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
      tx.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [memberDraft]),
    );
    for (const kind of ['organiser', 'coOrganiser'] as const) {
      expect(await visibleRows(harness, actors[kind], PROBE, [memberDraft]), kind).toBe(1);
      expect(await synced('trip', kind), kind).toContain(memberDraft);
    }
    expect(await synced('trip', 'outsider')).toEqual([]);
  });
});
