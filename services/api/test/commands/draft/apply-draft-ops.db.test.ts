/**
 * The organiser edits her private draft by hand, on the real stack: every edit lands as a new
 * organiser-only draft the crew never hears about; a member is refused; a stale base is told the
 * latest draft; nothing is accepted while the guide is drafting; the crew plan's own command still
 * has no plan to edit. Edits do not pile up: two hundred of them leave one hand-edited draft, while
 * a draft the guide made stays in the history when she edits it.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDraftCommands } from '../../../src/commands/draft';
import { registerPlanCommands } from '../../../src/commands/plan';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;
const stop = randomUUID();

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const tokyo = (date: string, hour: number) =>
  new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+09:00`).toISOString();

const edit = (who: SignedIn, base: string, ops: unknown[], cmd = 'apply_draft_ops') =>
  harness.run(who, cmd, { trip_id: crew.tripId, base_version: base, ops });

const moveTo = (hour: number, dayNo = 1) => ({
  op: 'move',
  item: stop,
  new: {
    day_no: dayNo,
    starts_at: tokyo(day(39 + dayNo), hour),
    ends_at: tokyo(day(39 + dayNo), hour + 1),
  },
});

async function trip() {
  const { rows } = await harness.pool.query<{
    status: string;
    draft: string;
    current: string | null;
    versions: number;
    items: number;
  }>(
    `SELECT status, draft_version_id AS draft, current_version_id AS current,
            (SELECT count(*)::int FROM itinerary_versions v WHERE v.trip_id = t.id) AS versions,
            (SELECT count(*)::int FROM plan_items i WHERE i.trip_id = t.id) AS items
       FROM trips t WHERE id = $1`,
    [crew.tripId],
  );
  return rows[0]!;
}

beforeAll(async () => {
  harness = await startSetupHarness((registry) => {
    registerDraftCommands(registry);
    registerPlanCommands(registry);
  });
  crew = await buildSetupCrew(harness, 2);
  const locked = await harness.run(crew.organiser, 'lock_trip_dates', {
    trip_id: crew.tripId,
    start: day(40),
    end: day(42),
  });
  if (locked.status !== 200) throw new Error(JSON.stringify(locked.body));
  await harness.run(crew.organiser, 'ensure_plan_days', { trip_id: crew.tripId });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('apply_draft_ops', () => {
  it('lands an organiser edit as a new private draft and refuses a member', async () => {
    const [, member] = crew.members as [SignedIn, SignedIn];
    const empty = (await trip()).draft;
    const add = {
      op: 'add',
      item: stop,
      new: {
        day_no: 1,
        starts_at: tokyo(day(40), 10),
        ends_at: tokyo(day(40), 11),
        tz: 'Asia/Tokyo',
        custom_place: { name: 'Aunt Mai', lat: 35.01, lng: 135.76 },
        category: 'activity',
      },
    };
    expect(errorOf(await edit(member, empty, [add])).code).toBe('FORBIDDEN');

    const added = await edit(crew.organiser, empty, [add]);
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const first = resultOf<{ version_id: string }>(added).version_id;
    // The untouched empty plan is gone; the trip is still in set-up with no crew plan.
    expect(await trip()).toEqual({
      status: 'setup',
      draft: first,
      current: null,
      versions: 1,
      items: 1,
    });
    const { rows: version } = await harness.pool.query(
      'SELECT visibility, status, origin FROM itinerary_versions WHERE id = $1',
      [first],
    );
    expect(version[0]).toEqual({ visibility: 'organiser', status: 'draft', origin: 'hand' });
    const { rows: item } = await harness.pool.query(
      'SELECT created_by_kind, custom_place FROM plan_items WHERE version_id = $1',
      [first],
    );
    expect(item[0]).toMatchObject({ created_by_kind: 'user', custom_place: { name: 'Aunt Mai' } });

    expect(errorOf(await edit(crew.organiser, empty, [moveTo(12)]))).toMatchObject({
      code: 'PLAN_VERSION_CONFLICT',
      detail: { latest: first },
    });
    expect(
      errorOf(await edit(crew.organiser, first, [moveTo(12)], 'apply_plan_ops')),
    ).toMatchObject({ code: 'STATE_INVALID', detail: { reason: 'no_plan' } });
  });

  it('moves, retimes and removes on the draft, telling only the organisers', async () => {
    let base = (await trip()).draft;
    const moved = await edit(crew.organiser, base, [moveTo(14, 2)]);
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    base = resultOf<{ version_id: string }>(moved).version_id;
    const { rows } = await harness.pool.query<{ day_no: number; at: Date }>(
      `SELECT d.day_no, i.starts_at AS at FROM plan_items i JOIN plan_days d ON d.id = i.day_id
        WHERE i.version_id = $1`,
      [base],
    );
    expect(rows.map((row) => [row.day_no, row.at.toISOString()])).toEqual([
      [2, tokyo(day(41), 14)],
    ]);

    const removed = await edit(crew.organiser, base, [{ op: 'remove', item: stop }]);
    base = resultOf<{ version_id: string }>(removed).version_id;
    expect(await trip()).toMatchObject({ draft: base, versions: 1, items: 0 });

    const { rows: heard } = await harness.pool.query<{ channel: string }>(
      `SELECT DISTINCT channel FROM rt_outbox
        WHERE channel LIKE 'trip_plan:%' OR channel LIKE 'crew_chat:%'`,
    );
    expect(heard).toEqual([]);
    const { rows: events } = await harness.pool.query<{ type: string; n: number }>(
      `SELECT type, count(*)::int AS n FROM domain_events
        WHERE trip_id = $1 AND type IN ('plan.ops_applied', 'draft.ops_applied') GROUP BY type`,
      [crew.tripId],
    );
    expect(events).toEqual([{ type: 'draft.ops_applied', n: 3 }]);
  });

  it('keeps one hand-edited draft after two hundred edits', { timeout: 120_000 }, async () => {
    let base = (await trip()).draft;
    const added = await edit(crew.organiser, base, [
      {
        op: 'add',
        item: stop,
        new: {
          day_no: 1,
          starts_at: tokyo(day(40), 9),
          ends_at: tokyo(day(40), 10),
          tz: 'Asia/Tokyo',
          custom_place: { name: 'Aunt Mai', lat: 35.01, lng: 135.76 },
        },
      },
    ]);
    base = resultOf<{ version_id: string }>(added).version_id;
    for (let i = 0; i < 200; i += 1) {
      // The command door's per-person rate limit is not what this proves.
      if (i % 20 === 0) await harness.redis.flushAll();
      const next = await edit(crew.organiser, base, [moveTo(9 + (i % 8))]);
      if (next.status !== 200) throw new Error(JSON.stringify(next.body));
      base = resultOf<{ version_id: string }>(next).version_id;
    }
    expect(await trip()).toMatchObject({ draft: base, versions: 1, items: 1 });
    const { rows } = await harness.pool.query<{ days: number }>(
      'SELECT count(*)::int AS days FROM plan_days WHERE trip_id = $1',
      [crew.tripId],
    );
    expect(rows[0]?.days).toBe(3);
  });

  it("reorders days inside one stop and never carries a day into another stop's nights", async () => {
    await harness.redis.flushAll();
    // One night then one night: day 1 is the first stop's, days 2 and 3 the second's.
    await harness.pool.query(
      `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
       SELECT t.id, t.crew_id, n, t.destination_id, 1 FROM trips t, generate_series(1, 2) AS n
        WHERE t.id = $1`,
      [crew.tripId],
    );
    try {
      const base = (await trip()).draft;
      const reorder = (order: number[], from = base) =>
        edit(crew.organiser, from, [{ op: 'reorder_days', new: { order } }]);
      expect(errorOf(await reorder([2, 1, 3]))).toMatchObject({
        code: 'STATE_INVALID',
        detail: { reason: 'stop_day_fixed', day_no: 2 },
      });
      expect((await trip()).draft).toBe(base);
      expect((await reorder([1, 3, 2])).status).toBe(200);
    } finally {
      await harness.pool.query('DELETE FROM trip_stops WHERE trip_id = $1', [crew.tripId]);
    }
  });

  it('keeps a draft the guide made when she edits it, and waits while the guide drafts', async () => {
    await harness.redis.flushAll();
    const guideDraft = (await trip()).draft;
    await harness.pool.query("UPDATE itinerary_versions SET origin = 'guide' WHERE id = $1", [
      guideDraft,
    ]);
    // The guide's draft job takes a trip from set-up through drafting to review.
    for (const status of ['drafting', 'draft_review']) {
      await harness.pool.query('UPDATE trips SET status = $2 WHERE id = $1', [crew.tripId, status]);
    }
    const edited = await edit(crew.organiser, guideDraft, [moveTo(16)]);
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    const mine = resultOf<{ version_id: string }>(edited).version_id;
    const { rows } = await harness.pool.query(
      'SELECT id, status, origin, parent_id FROM itinerary_versions WHERE trip_id = $1 ORDER BY created_at, id',
      [crew.tripId],
    );
    expect(rows).toEqual([
      { id: guideDraft, status: 'superseded', origin: 'guide', parent_id: null },
      { id: mine, status: 'draft', origin: 'hand', parent_id: guideDraft },
    ]);

    await harness.pool.query("UPDATE trips SET status = 'redrafting' WHERE id = $1", [crew.tripId]);
    expect(errorOf(await edit(crew.organiser, mine, [moveTo(17)]))).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'draft_running' },
    });
  });
});
