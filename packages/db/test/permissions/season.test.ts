import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let destinationId: string;
let reviewedMonthId: string;
let draftMonthId: string;
let reviewedEventId: string;
let draftEventId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const seeded = await withSystem(harness.db.pool, async (tx) => {
    const destination = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ('season-kyoto', 'Kyoto') RETURNING id",
    );
    const dest = destination.rows[0]!.id;
    const month = async (value: number, reviewed: boolean) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO season_months (destination_id, month, crowd_index, highlight_tag, colour_role, source, sourced_on, reviewed_at)
         VALUES ($1, $2, 90, 'APR BLOSSOMS', 'peak', 'JNTO seasonal calendar', '2026-09-27', $3) RETURNING id`,
        [dest, value, reviewed ? new Date() : null],
      );
      return rows[0]!.id;
    };
    const event = async (key: string, reviewed: boolean) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, source, sourced_on, reviewed_at)
         VALUES ($1, $2, 'blossom', 'Cherry blossom', '2027-03-28', '2027-04-08', 'JMA sakura normals', '2026-09-27', $3)
         RETURNING id`,
        [dest, key, reviewed ? new Date() : null],
      );
      return rows[0]!.id;
    };
    return {
      dest,
      reviewedMonth: await month(4, true),
      draftMonth: await month(11, false),
      reviewedEvent: await event('cherry-blossom', true),
      draftEvent: await event('autumn-leaves', false),
    };
  });
  destinationId = seeded.dest;
  reviewedMonthId = seeded.reviewedMonth;
  draftMonthId = seeded.draftMonth;
  reviewedEventId = seeded.reviewedEvent;
  draftEventId = seeded.draftEvent;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function visibleIds(table: 'season_months' | 'season_events'): Promise<string[]> {
  const uid = harness.fixture.actors.outsider;
  return withUser(harness.db.pool, uid, 'device', async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `SELECT id FROM ${table} WHERE destination_id = $1`,
      [destinationId],
    );
    return rows.map((row) => row.id);
  });
}

describe('season_months / season_events RLS: reviewed catalogue rows only', () => {
  it('serves a reviewed month to any authenticated app_user and hides a draft', async () => {
    expect(await visibleIds('season_months')).toEqual([reviewedMonthId]);
    expect(await visibleIds('season_months')).not.toContain(draftMonthId);
  });

  it('serves a reviewed event and hides a draft', async () => {
    expect(await visibleIds('season_events')).toEqual([reviewedEventId]);
    expect(await visibleIds('season_events')).not.toContain(draftEventId);
  });

  it('rejects an app_user write outright', async () => {
    const uid = harness.fixture.actors.organiser;
    await expect(
      withUser(harness.db.pool, uid, 'device', (tx) =>
        tx.query('UPDATE season_months SET reviewed_at = now() WHERE id = $1', [draftMonthId]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(harness.db.pool, uid, 'device', (tx) =>
        tx.query('DELETE FROM season_events WHERE id = $1', [reviewedEventId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('rejects out-of-range months and indexes, unknown kinds, reversed dates and blank sources', async () => {
    const bad = [
      `INSERT INTO season_months (destination_id, month, crowd_index, source, sourced_on) VALUES ($1, 13, 50, 's', '2026-09-27')`,
      `INSERT INTO season_months (destination_id, month, crowd_index, source, sourced_on) VALUES ($1, 5, 101, 's', '2026-09-27')`,
      `INSERT INTO season_months (destination_id, month, crowd_index, colour_role, source, sourced_on) VALUES ($1, 6, 50, 'hot', 's', '2026-09-27')`,
      `INSERT INTO season_months (destination_id, month, crowd_index, source, sourced_on) VALUES ($1, 7, 50, '  ', '2026-09-27')`,
      `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, source, sourced_on) VALUES ($1, 'k1', 'parade', 'n', '2027-01-01', '2027-01-02', 's', '2026-09-27')`,
      `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on, source, sourced_on) VALUES ($1, 'k2', 'festival', 'n', '2027-01-05', '2027-01-02', 's', '2026-09-27')`,
    ];
    for (const statement of bad) {
      await expect(
        withSystem(harness.db.pool, (tx) => tx.query(statement, [destinationId])),
      ).rejects.toThrow(/check constraint/i);
    }
  });
});
