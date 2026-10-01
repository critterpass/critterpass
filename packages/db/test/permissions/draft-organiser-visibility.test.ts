/**
 * An organiser's draft stays theirs: a version with `visibility = 'organiser'`, its days and items
 * (with the drafting columns `metrics`, `coverage` and `locked_reason`, and the translations of the
 * guide's text in `i18n`) and the trip's drafting jobs reach organisers only, whether read
 * directly, through the sync streams or through the guide's `llm.plan_items`. Nobody writes the
 * drafting columns or an item's translations as `app_user`.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let versionId: string;
let itemId: string;
let jobId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { tripId, actors } = harness.fixture;
  await withSystem(harness.db.pool, async (tx) => {
    const job = await tx.query<{ id: string }>(
      "INSERT INTO agent_jobs (trip_id, user_id, kind, status) VALUES ($1, $2, 'draft', 'succeeded') RETURNING id",
      [tripId, actors.organiser],
    );
    jobId = job.rows[0]?.id as string;
    const version = await tx.query<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, visibility, status, created_by_job_id, metrics, coverage)
       VALUES ($1, 'organiser', 'draft', $2, '{"cost_pp_minor": 42000}', '{"must_dos": {"total": 1}}')
       RETURNING id`,
      [tripId, jobId],
    );
    versionId = version.rows[0]?.id as string;
    const day = await tx.query<{ id: string }>(
      `INSERT INTO plan_days (version_id, trip_id, day_no, date, theme, i18n)
       VALUES ($1, $2, 1, '2026-11-02', 'Old town', '{"_src": "a", "vi": {"theme": "Phố cổ"}}')
       RETURNING id`,
      [versionId, tripId],
    );
    const item = await tx.query<{ id: string }>(
      `INSERT INTO plan_items (version_id, day_id, trip_id, category, locked_reason, created_by_kind,
         notes, i18n)
       VALUES ($1, $2, $3, 'activity', 'must_do', 'guide', 'Go early',
         '{"_src": "b", "vi": {"notes": "Đi sớm"}}') RETURNING id`,
      [versionId, day.rows[0]?.id, tripId],
    );
    itemId = item.rows[0]?.id as string;
    await tx.query('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [tripId, versionId]);
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const PROBES = [
  ['itinerary_versions', 'SELECT metrics, coverage FROM itinerary_versions WHERE id = $1'],
  ['plan_days', 'SELECT i18n FROM plan_days WHERE version_id = $1 AND i18n IS NOT NULL'],
  [
    'plan_items',
    'SELECT locked_reason, i18n FROM plan_items WHERE version_id = $1 AND i18n IS NOT NULL',
  ],
] as const;

describe('organiser drafts', () => {
  it('are read, drafting columns included, by organisers only', async () => {
    const { actors } = harness.fixture;
    for (const [table, sql] of PROBES) {
      for (const kind of ['organiser', 'coOrganiser'] as const) {
        expect(await visibleRows(harness, actors[kind], sql, [versionId]), `${table} ${kind}`).toBe(
          1,
        );
      }
      for (const kind of ['member', 'exMember', 'outsider', 'anonymous'] as const) {
        expect(await visibleRows(harness, actors[kind], sql, [versionId]), `${table} ${kind}`).toBe(
          0,
        );
      }
    }
    const job = 'SELECT 1 FROM agent_jobs WHERE id = $1';
    expect(await visibleRows(harness, actors.coOrganiser, job, [jobId])).toBe(1);
    for (const kind of ['member', 'exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], job, [jobId]), kind).toBe(0);
    }
  });

  it('sync to organisers on trip_draft and to nobody on trip', async () => {
    const { tripId } = harness.fixture;
    const organiser = await harness.rows('trip_draft', 'organiser', { trip_id: tripId });
    expect(organiser.get('itinerary_versions')?.map((row) => row.id)).toContain(versionId);
    expect(organiser.get('plan_items')?.map((row) => row.id)).toContain(itemId);
    // The translations travel with the row, to the same people.
    const synced = organiser.get('plan_items')?.find((row) => row.id === itemId);
    expect(JSON.stringify(synced?.['i18n'])).toContain('Đi sớm');
    expect(organiser.get('agent_jobs')?.map((row) => row.id)).toContain(jobId);
    for (const kind of ['member', 'exMember', 'outsider', 'anonymous'] as const) {
      const draft = await harness.rows('trip_draft', kind, { trip_id: tripId });
      expect(draft.get('itinerary_versions') ?? [], kind).toHaveLength(0);
      expect(draft.get('agent_jobs') ?? [], kind).toHaveLength(0);
      const trip = await harness.rows('trip', kind, { trip_id: tripId });
      const ids = (trip.get('itinerary_versions') ?? []).map((row) => row.id);
      expect(ids, kind).not.toContain(versionId);
      expect(
        (trip.get('plan_items') ?? []).map((row) => row.id),
        kind,
      ).not.toContain(itemId);
    }
  });

  it('reach the guide in llm.plan_items only for an organiser', async () => {
    const { actors, tripId } = harness.fixture;
    const read = (uid: string) =>
      withGuideReader(harness.db.pool, uid, tripId, async (tx) => {
        const { rows } = await tx.query<{ stable_id: string; locked_reason: string | null }>(
          'SELECT stable_id, locked_reason FROM llm.plan_items WHERE version_id = $1',
          [versionId],
        );
        return rows;
      });
    const organiser = await read(actors.organiser);
    expect(organiser.map((row) => row.locked_reason)).toEqual(['must_do']);
    expect(await read(actors.member)).toHaveLength(0);
    expect(await read(actors.outsider)).toHaveLength(0);
  });

  it('never lets app_user write the drafting columns', async () => {
    const { actors } = harness.fixture;
    for (const kind of ['organiser', 'member'] as const) {
      await expect(
        withUser(harness.db.pool, actors[kind], randomUUID(), (tx) =>
          tx.query("UPDATE plan_items SET locked_reason = 'user' WHERE id = $1", [itemId]),
        ),
        kind,
      ).rejects.toThrow(/permission denied/i);
      await expect(
        withUser(harness.db.pool, actors[kind], randomUUID(), (tx) =>
          tx.query(`UPDATE plan_items SET i18n = '{"vi": {"notes": "x"}}' WHERE id = $1`, [itemId]),
        ),
        kind,
      ).rejects.toThrow(/permission denied/i);
    }
    const member = await withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
      tx.query("UPDATE itinerary_versions SET metrics = '{}' WHERE id = $1", [versionId]),
    );
    expect(member.rowCount).toBe(0);
  });
});
