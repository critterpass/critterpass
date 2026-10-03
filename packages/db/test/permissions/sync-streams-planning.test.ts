/**
 * The planning streams end to end (infra/powersync/streams/planning.yaml): the crew gets the trip's
 * Ideas, stances, plan check and legs; nobody outside the crew gets any of it; a person's hidden
 * places and private asks travel on their own `me` stream only; and the guide reads the three
 * planning views but none of the tables behind them.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader } from '../../src/tx';
import { startStreamHarness, STREAM_ACTORS, type StreamHarness } from '../helpers/stream-harness';

const TRIP_TABLES = [
  'trip_ideas',
  'place_stances',
  'plan_checks',
  'plan_check_issues',
  'plan_legs',
];
const PRIVATE_TABLES = ['place_hides', 'member_asks'];

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('planning on the trip stream', () => {
  it.each(['member', 'organiser'] as const)('brings %s every planning table', async (kind) => {
    const rows = await harness.rows('trip', kind, { trip_id: harness.fixture.tripId });
    for (const table of TRIP_TABLES) {
      expect(rows.get(table)?.length ?? 0, table).toBeGreaterThan(0);
    }
    for (const table of PRIVATE_TABLES) expect(rows.get(table) ?? [], table).toEqual([]);
  });

  it.each(['outsider', 'exMember', 'anonymous'] as const)('brings %s nothing', async (kind) => {
    const rows = await harness.rows('trip', kind, { trip_id: harness.fixture.tripId });
    for (const table of [...TRIP_TABLES, ...PRIVATE_TABLES]) {
      expect(rows.get(table) ?? [], table).toEqual([]);
    }
  });

  it('syncs the plan check under its trip id, the row id every synced table needs', async () => {
    const rows = await harness.rows('trip', 'member', { trip_id: harness.fixture.tripId });
    expect(rows.get('plan_checks')?.map((row) => row['id'])).toEqual([harness.fixture.tripId]);
  });
});

describe('private planning rows on the me stream', () => {
  it.each(STREAM_ACTORS)('brings %s only their own hides and asks', async (kind) => {
    const uid = harness.fixture.actors[kind];
    const rows = await harness.rows('me', kind);
    for (const row of rows.get('place_hides') ?? []) expect(row['user_id']).toBe(uid);
    for (const row of rows.get('member_asks') ?? []) {
      expect([row['asked_by'], row['member_id']]).toContain(uid);
    }
  });

  it("never brings a crewmate's hidden place to anyone else on any stream", async () => {
    const { tripId } = harness.fixture;
    for (const kind of ['member', 'coOrganiser', 'outsider'] as const) {
      for (const stream of Object.keys(harness.config.streams)) {
        const rows = await harness.rows(stream, kind, { trip_id: tripId });
        expect(rows.get('place_hides') ?? [], `${stream} for ${kind}`).toEqual([]);
      }
    }
  });
});

describe('guide_reader', () => {
  it('reads the three planning views and none of the planning tables', async () => {
    const { actors, tripId } = harness.fixture;
    await withGuideReader(harness.db.pool, actors.member, tripId, async (tx) => {
      for (const view of ['llm.trip_ideas', 'llm.place_stances', 'llm.plan_check_issues']) {
        const { rowCount } = await tx.query(`SELECT 1 FROM ${view}`);
        expect(rowCount, view).toBeGreaterThan(0);
      }
    });
    for (const table of [...TRIP_TABLES, ...PRIVATE_TABLES, 'route_cache', 'climate_normals']) {
      await expect(
        withGuideReader(harness.db.pool, actors.member, tripId, (tx) =>
          tx.query(`SELECT 1 FROM ${table}`),
        ),
        table,
      ).rejects.toThrow(/permission denied/i);
    }
  });
});
