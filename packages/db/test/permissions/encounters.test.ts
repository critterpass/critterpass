/**
 * `encounters` (C1), `encounter_evidence` (C3) and `encounter_samples` (C3): a traveller starts
 * and reads only their own encounters; the signed evidence and the per-sample rows are readable by
 * no client role and never published; samples carry a distance band, never a coordinate.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function probeRule(): Promise<{ rule: string; form: string }> {
  const { rows } = await harness.db.pool.query<{ rule: string; form: string }>(
    "SELECT r.id AS rule, r.form_id AS form FROM spawn_rules r WHERE r.key = 'cp-999:legendary#1'",
  );
  return rows[0]!;
}

describe('encounters', () => {
  it('shows a traveller their own encounters only, on me', async () => {
    const { actors } = harness.fixture;
    const probe = 'SELECT 1 FROM encounters';
    expect(await visibleRows(harness, actors.organiser, probe)).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe), kind).toBe(0);
    }
    expect((await harness.rows('me', 'organiser')).get('encounters')).toHaveLength(1);
    expect((await harness.rows('me', 'member')).get('encounters') ?? []).toHaveLength(0);
  });

  it('lets a traveller insert their own accruing encounter, never someone else’s or a verdict', async () => {
    const { actors, tripId } = harness.fixture;
    const { rule, form } = await probeRule();
    const insert = (uid: string, owner: string) =>
      withUser(harness.db.pool, uid, randomUUID(), (tx) =>
        tx.query(
          `INSERT INTO encounters (id, user_id, trip_id, spawn_rule_id, form_id, started_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [randomUUID(), owner, tripId, rule, form],
        ),
      );
    await expect(insert(actors.member, actors.member)).resolves.toBeDefined();
    await expect(insert(actors.member, actors.organiser)).rejects.toThrow(/row-level security/i);
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query("UPDATE encounters SET verification = 'verified' WHERE user_id = $1", [
          actors.member,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps evidence and samples away from every client role and the guide', async () => {
    const { actors, tripId } = harness.fixture;
    for (const table of ['encounter_evidence', 'encounter_samples', 'encounters']) {
      if (table !== 'encounters') {
        await expect(
          withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
            tx.query(`SELECT * FROM ${table}`),
          ),
        ).rejects.toThrow(/permission denied/i);
      }
      await expect(
        withGuideReader(harness.db.pool, actors.organiser, tripId, (tx) =>
          tx.query(`SELECT * FROM ${table}`),
        ),
      ).rejects.toThrow(/permission denied/i);
    }
    const { rows } = await harness.db.pool.query(
      `SELECT tablename FROM pg_publication_tables
        WHERE pubname = 'powersync' AND tablename IN ('encounter_evidence', 'encounter_samples')`,
    );
    expect(rows).toEqual([]);
    const reads = await withSystem(harness.db.pool, (tx) =>
      tx.query('SELECT 1 FROM encounter_evidence'),
    );
    expect(reads.rowCount).toBe(1);
  });

  it('gives encounter samples no coordinate or geometry column', async () => {
    const { rows } = await harness.db.pool.query<{ column_name: string; udt_name: string }>(
      `SELECT column_name, udt_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN ('encounter_samples', 'encounters')`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.column_name, row.column_name).not.toMatch(/lat|lng|lon|coord|geom|point/i);
      expect(row.udt_name, row.column_name).not.toMatch(/geometry|geography|point/i);
    }
  });
});
