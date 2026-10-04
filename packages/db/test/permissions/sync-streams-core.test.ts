import { readFile } from 'node:fs/promises';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  GENERATED_PATH,
  loadStreamSources,
  mergeStreamSources,
  renderSyncConfig,
} from '../../../../infra/powersync/build-config';
import { computePublicationAllowList } from '../../src/publication';
import { withSystem } from '../../src/tx';
import { insertTripParticipant } from '../helpers/actors';
import {
  insertChangeSet,
  insertItineraryVersion,
  insertPlanDay,
  insertPlanItem,
} from '../helpers/plan-actors';
import {
  idsByTable,
  referencedTables,
  startStreamHarness,
  STREAM_ACTORS,
  totalRows,
  type StreamHarness,
} from '../helpers/stream-harness';

let harness: StreamHarness;
let draft: { versionId: string; dayId: string; itemId: string; changeSetId: string };
let otherTripId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { fixture } = harness;
  draft = await withSystem(harness.db.pool, async (tx) => {
    const versionId = await insertItineraryVersion(tx, {
      tripId: fixture.tripId,
      visibility: 'organiser',
      status: 'draft',
    });
    const dayId = await insertPlanDay(tx, { versionId, tripId: fixture.tripId, dayNo: 1 });
    const item = await insertPlanItem(tx, {
      versionId,
      dayId,
      tripId: fixture.tripId,
      category: 'museum',
    });
    const changeSetId = await insertChangeSet(tx, {
      tripId: fixture.tripId,
      baseVersionId: versionId,
      authorId: fixture.actors.organiser,
      ops: [],
    });
    // Proposed: an unsent draft would reach its author alone (change-set-drafts.test.ts).
    await tx.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [changeSetId]);
    // The removed ex-member still holds an organiser seat: the crew check alone must lock them out.
    await insertTripParticipant(tx, {
      tripId: fixture.tripId,
      userId: fixture.actors.exMember,
      role: 'organiser',
    });
    return { versionId, dayId, itemId: item.id, changeSetId };
  });
  // A second crew's trip, visible to nobody in the fixture crew.
  otherTripId = await withSystem(harness.db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `WITH c AS (INSERT INTO crews (name, created_by) VALUES ('Other crew', $1) RETURNING id)
       INSERT INTO trips (crew_id, status) SELECT id, 'voting' FROM c RETURNING id`,
      [fixture.actors.outsider],
    );
    return rows[0]!.id;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('sync config build', () => {
  it('keeps the committed sync-streams.yaml in step with streams/*.yaml', async () => {
    const committed = await readFile(GENERATED_PATH, 'utf8');
    expect(committed).toBe(await renderSyncConfig(harness.config));
  });

  it('only streams tables in the powersync publication, and streams every published table', () => {
    const published = new Set(computePublicationAllowList());
    const streamed = new Set<string>();
    for (const stream of Object.values(harness.config.streams)) {
      const ctes = { ...harness.config.with, ...stream.with };
      for (const query of stream.queries) {
        for (const table of referencedTables(query, ctes)) streamed.add(table);
      }
    }
    expect([...streamed].filter((table) => !published.has(table))).toEqual([]);
    expect([...published].filter((table) => !streamed.has(table))).toEqual([]);
  });

  it('rejects a stream whose files disagree on auto_subscribe', () => {
    const a = {
      file: 'a.yaml',
      text: 'streams:\n  s:\n    auto_subscribe: true\n    query: SELECT * FROM t\n',
    };
    const b = { file: 'b.yaml', text: 'streams:\n  s:\n    query: SELECT * FROM u\n' };
    expect(() => mergeStreamSources([a, b])).toThrow(/stream options disagree/);
  });

  it('rejects unknown keys and conflicting global CTEs', () => {
    const typo = { file: 'a.yaml', text: 'streams:\n  s:\n    querys: SELECT * FROM t\n' };
    expect(() => mergeStreamSources([typo])).toThrow(/unknown key `querys`/);
    const one = { file: 'a.yaml', text: 'with:\n  x: SELECT a FROM t\nstreams: {}\n' };
    const two = { file: 'b.yaml', text: 'with:\n  x: SELECT b FROM t\nstreams: {}\n' };
    expect(() => mergeStreamSources([one, two])).toThrow(/CTE `x` is declared twice/);
  });

  it('merges same-named streams across the committed area files', async () => {
    const merged = mergeStreamSources(await loadStreamSources());
    const meTables = merged.streams['me']!.queries.map((query) =>
      referencedTables(query, merged.with),
    );
    expect(meTables.flat()).toEqual(expect.arrayContaining(['users', 'user_entitlements']));
  });
});

describe('me stream', () => {
  it("syncs the organiser's own settings, consents and deletion request", async () => {
    const ids = idsByTable(await harness.rows('me', 'organiser'));
    expect(ids['users']).toEqual([harness.fixture.actors.organiser]);
    expect(ids['user_settings']).toEqual([harness.fixture.actors.organiser]);
    expect(ids['consents']).toHaveLength(1);
    expect(ids['account_deletions']).toHaveLength(1);
    expect(ids['cmd_results']).toEqual([]);
  });

  it("syncs a member's own command results only", async () => {
    const ids = idsByTable(await harness.rows('me', 'member'));
    expect(ids['users']).toEqual([harness.fixture.actors.member]);
    expect(ids['cmd_results']).toHaveLength(1);
    expect(ids['user_settings']).toEqual([]);
    expect(ids['consents']).toEqual([]);
  });

  it('syncs nothing to a uid with no backing user', async () => {
    expect(totalRows(await harness.rows('me', 'anonymous'))).toBe(0);
  });
});

describe('crews stream', () => {
  it.each(['outsider', 'exMember', 'anonymous'] as const)(
    'syncs zero rows to %s',
    async (actor) => {
      expect(totalRows(await harness.rows('crews', actor))).toBe(0);
    },
  );

  it.each(['member', 'organiser'] as const)(
    'syncs the crew, its roster and trips to %s',
    async (actor) => {
      const ids = idsByTable(await harness.rows('crews', actor));
      expect(ids['crews']).toEqual([harness.fixture.crewId]);
      // Every roster row of the crew, former members included, as the crew_members policy allows.
      expect(ids['crew_members']).toHaveLength(4);
      expect(ids['trips']).toEqual([harness.fixture.tripId]);
    },
  );
});

describe('crew_people stream', () => {
  it('syncs active co-members only', async () => {
    const { actors } = harness.fixture;
    const ids = idsByTable(await harness.rows('crew_people', 'member'));
    expect(ids['users']).toEqual([actors.organiser, actors.coOrganiser, actors.member].sort());
  });

  it.each(['outsider', 'exMember', 'anonymous'] as const)(
    'syncs zero rows to %s',
    async (actor) => {
      expect(totalRows(await harness.rows('crew_people', actor))).toBe(0);
    },
  );
});

describe('trip stream', () => {
  const params = (): Record<string, string> => ({ trip_id: harness.fixture.tripId });

  it.each(['outsider', 'exMember', 'anonymous'] as const)(
    'syncs zero rows to %s',
    async (actor) => {
      expect(totalRows(await harness.rows('trip', actor, params()))).toBe(0);
    },
  );

  it.each(['member', 'organiser'] as const)(
    'syncs the trip and its crew-visible plan to %s',
    async (actor) => {
      const { fixture } = harness;
      const ids = idsByTable(await harness.rows('trip', actor, params()));
      expect(ids['trips']).toEqual([fixture.tripId]);
      expect(ids['trip_participants']).toHaveLength(4);
      expect(ids['itinerary_versions']).toEqual([fixture.versionId]);
      expect(ids['plan_days']).toEqual([fixture.dayId]);
      expect(ids['plan_items']).toHaveLength(1);
      expect(ids['change_sets']).toEqual([fixture.changeSetId]);
      expect(ids['guide_actions']).toHaveLength(1);
      expect(ids['activity_events']).toHaveLength(1);
      expect(ids['trip_entitlements']).toEqual([fixture.tripId]);
      expect(ids['usage_counters']).toHaveLength(1);
    },
  );

  it("syncs nothing without a trip_id, or for another crew's trip", async () => {
    expect(totalRows(await harness.rows('trip', 'member'))).toBe(0);
    expect(totalRows(await harness.rows('trip', 'member', { trip_id: otherTripId }))).toBe(0);
  });
});

describe('trip_draft stream', () => {
  const params = (): Record<string, string> => ({ trip_id: harness.fixture.tripId });

  it.each(['organiser', 'coOrganiser'] as const)(
    'syncs organiser-only drafts to %s',
    async (actor) => {
      const ids = idsByTable(await harness.rows('trip_draft', actor, params()));
      const proposalIds = async (table: string) =>
        (
          await harness.db.pool.query<{ id: string }>(
            `SELECT id FROM ${table} WHERE trip_id = $1 ORDER BY id`,
            [harness.fixture.tripId],
          )
        ).rows.map((row) => row.id);
      expect(ids).toEqual({
        proposals: await proposalIds('proposals'),
        proposal_versions: await proposalIds('proposal_versions'),
        rsvp_suggestions: await proposalIds('rsvp_suggestions'),
        agent_jobs: [harness.fixture.agentJobId],
        itinerary_versions: [draft.versionId],
        plan_days: [draft.dayId],
        plan_items: [draft.itemId],
        change_sets: [draft.changeSetId],
        plan_legs: [],
        plan_check_issues: [],
        redraft_reservations: [harness.fixture.redraftReservationId],
      });
    },
  );

  it.each(['outsider', 'exMember', 'member', 'anonymous'] as const)(
    'syncs zero rows to %s',
    async (actor) => {
      expect(totalRows(await harness.rows('trip_draft', actor, params()))).toBe(0);
    },
  );
});

describe('catalog stream', () => {
  it.each(STREAM_ACTORS)('syncs the global catalogue to %s', async (actor) => {
    const ids = idsByTable(await harness.rows('catalog', actor));
    expect(ids['guides']?.length).toBeGreaterThan(0);
    expect(ids['destinations']?.length).toBeGreaterThan(0);
    expect(ids['client_config']).toContain('matrix.probe');
  });
});
