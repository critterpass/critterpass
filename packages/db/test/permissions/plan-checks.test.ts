/**
 * `plan_checks` and `plan_check_issues` (C1, RLS T; issues also by version visibility): the trip's
 * crew reads the latest check and its issues on the trip stream; outsiders read nothing; only the
 * plan check job writes them. An issue on an organiser-only draft stays with organisers, and the
 * guide reads the issues of the crew's plan only.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem } from '../../src/tx';
import { insertItineraryVersion } from '../helpers/plan-actors';
import { expectCrewReadOnly, visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let draftIssueId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { tripId } = harness.fixture;
  draftIssueId = await withSystem(harness.db.pool, async (tx) => {
    const versionId = await insertItineraryVersion(tx, {
      tripId,
      visibility: 'organiser',
      status: 'draft',
    });
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO plan_check_issues (trip_id, version_id, kind, severity, params, rank, fingerprint)
       VALUES ($1, $2, 'pace', 'know', '{"stops": 8, "limit": 6}', 0, 'pace:draft') RETURNING id`,
      [tripId, versionId],
    );
    return rows[0]!.id;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe.each(['plan_checks', 'plan_check_issues'])('%s', (table) => {
  it('is read by the crew only, synced on the trip stream and never written by app_user', async () => {
    await expectCrewReadOnly(harness, table);
  });
});

describe('plan_check_issues', () => {
  it("keeps an organiser-only draft's issues to organisers and off the trip stream", async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT 1 FROM plan_check_issues WHERE id = $1';
    expect(await visibleRows(harness, actors.coOrganiser, probe, [draftIssueId])).toBe(1);
    expect(await visibleRows(harness, actors.member, probe, [draftIssueId])).toBe(0);
    const trip = await harness.rows('trip', 'organiser', { trip_id: tripId });
    expect(trip.get('plan_check_issues')?.map((row) => row['id'])).not.toContain(draftIssueId);
  });

  it('rejects an unknown kind and params that are not an object', async () => {
    const { tripId, versionId } = harness.fixture;
    for (const [kind, params] of [
      ['vibes', '{}'],
      ['pace', '[]'],
    ]) {
      await expect(
        withSystem(harness.db.pool, (tx) =>
          tx.query(
            `INSERT INTO plan_check_issues (trip_id, version_id, kind, severity, params, rank, fingerprint)
             VALUES ($1, $2, $3, 'know', $4::jsonb, 1, 'probe')`,
            [tripId, versionId, kind, params],
          ),
        ),
      ).rejects.toThrow(/check constraint/);
    }
  });

  it("reaches the guide for the crew's plan only", async () => {
    const { actors, tripId } = harness.fixture;
    const read = (uid: string) =>
      withGuideReader(harness.db.pool, uid, tripId, async (tx) => {
        const { rows } = await tx.query<{ kind: string }>('SELECT kind FROM llm.plan_check_issues');
        return rows.map((row) => row.kind);
      });
    expect(await read(actors.organiser)).toEqual(['pace']);
    expect(await read(actors.outsider)).toEqual([]);
  });
});
