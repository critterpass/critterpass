/**
 * A plan check FIX on the organiser's private draft, on the real stack: it lands as a new
 * organiser-only draft made by hand (the draft's own edit path, with its event), the crew still
 * has no plan, the leg of the pair the fix left alone is still there, a member cannot use it, an issue from the draft before is stale, and a fix that
 * would put the stop on top of another is refused with the draft untouched.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCheckCommands } from '../../../src/commands/checks';
import { registerDraftCommands } from '../../../src/commands/draft';
import { planStaySource } from '../../../src/planning/fit/context';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
} from '../../setup/setup-harness';

const deps = { stays: planStaySource, now: () => new Date() };
let harness: SetupHarness;
let crew: SetupCrew;
const stops = { market: randomUUID(), lake: randomUUID() };

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const at = (hour: number, minute = 0) =>
  new Date(
    Date.parse(`${day(40)}T${String(hour).padStart(2, '0')}:00:00+09:00`) + minute * 60_000,
  ).toISOString();

async function draft(): Promise<{ versionId: string; dayId: string; current: string | null }> {
  const { rows } = await harness.pool.query<{
    version: string;
    day: string;
    current: string | null;
  }>(
    `SELECT t.draft_version_id AS version, d.id AS day, t.current_version_id AS current
       FROM trips t JOIN plan_days d ON d.version_id = t.draft_version_id AND d.day_no = 1
      WHERE t.id = $1`,
    [crew.tripId],
  );
  return { versionId: rows[0]!.version, dayId: rows[0]!.day, current: rows[0]!.current };
}

async function lakeStarts(versionId: string): Promise<string> {
  const { rows } = await harness.pool.query<{ starts_at: Date }>(
    'SELECT starts_at FROM plan_items WHERE version_id = $1 AND stable_id = $2',
    [versionId, stops.lake],
  );
  return rows[0]!.starts_at.toISOString();
}

/** A clash issue on the draft whose one-tap fix moves the lake to `hour:minute` for an hour. */
async function issue(from: string, hour: number, minute = 0): Promise<string> {
  const { versionId, dayId } = await draft();
  return withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO plan_check_issues (trip_id, version_id, kind, severity, day_id, stable_ids,
         params, fix, rank, fingerprint)
       VALUES ($1, $2, 'clash', 'fix', $3, $4::uuid[], $5, $6, 0, $7) RETURNING id`,
      [
        crew.tripId,
        versionId,
        dayId,
        [stops.market, stops.lake],
        JSON.stringify({ first: stops.market, second: stops.lake, short_minutes: 10 }),
        JSON.stringify({
          kind: 'apply',
          ops: [
            {
              op: 'retime',
              target: stops.lake,
              before: { starts_at: from, ends_at: at(14) },
              after: { starts_at: at(hour, minute), ends_at: at(hour + 1, minute) },
              reason: 'check_fix_clash',
              affected_user_ids: [],
              booking_impact: false,
            },
          ],
        }),
        randomUUID(),
      ],
    );
    return rows[0]!.id;
  });
}

beforeAll(async () => {
  harness = await startSetupHarness((registry) => {
    registerDraftCommands(registry);
    registerCheckCommands(registry, deps);
  });
  crew = await buildSetupCrew(harness, 2);
  const locked = await harness.run(crew.organiser, 'lock_trip_dates', {
    trip_id: crew.tripId,
    start: day(40),
    end: day(42),
  });
  if (locked.status !== 200) throw new Error(JSON.stringify(locked.body));
  await harness.run(crew.organiser, 'ensure_plan_days', { trip_id: crew.tripId });
  const stop = (item: string, hour: number) => ({
    op: 'add',
    item,
    new: {
      day_no: 1,
      starts_at: at(hour),
      ends_at: at(hour + 1),
      tz: 'Asia/Tokyo',
      custom_place: { name: 'By the lake', lat: 35.01, lng: 135.76 },
      category: 'activity',
    },
  });
  const added = await harness.run(crew.organiser, 'apply_draft_ops', {
    trip_id: crew.tripId,
    base_version: (await draft()).versionId,
    ops: [stop(stops.market, 10), stop(stops.lake, 13)],
  });
  if (added.status !== 200) throw new Error(JSON.stringify(added.body));
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('apply_draft_check_fix', () => {
  it('lands the fix as a new private draft made by hand, for an organiser only', async () => {
    const before = await draft();
    const issueId = await issue(at(13), 15);
    const payload = { issue_id: issueId, base_version: before.versionId };
    // The way from the market to the lake is stored for the draft she is looking at.
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `INSERT INTO plan_legs (trip_id, version_id, day_id, from_key, to_key, mode, minutes, meters,
                                source, approx)
         VALUES ($1, $2, $3, $4, $5, 'walk', 4, 300, 'valhalla', false)`,
        [crew.tripId, before.versionId, before.dayId, stops.market, stops.lake],
      ),
    );

    const denied = await harness.run(crew.members[1]!, 'apply_draft_check_fix', payload);
    expect(['NOT_FOUND', 'FORBIDDEN']).toContain(errorOf(denied).code);

    const fixed = await harness.run(crew.organiser, 'apply_draft_check_fix', payload);
    expect(fixed.status, JSON.stringify(fixed.body)).toBe(200);
    const result = resultOf<{ applied: boolean; version_id: string }>(fixed);
    expect(result.applied).toBe(true);
    const after = await draft();
    expect(after).toMatchObject({ versionId: result.version_id, current: null });
    expect(after.versionId).not.toBe(before.versionId);
    expect(await lakeStarts(after.versionId)).toBe(at(15));
    const { rows: version } = await harness.pool.query(
      'SELECT visibility, status, origin FROM itinerary_versions WHERE id = $1',
      [after.versionId],
    );
    expect(version[0]).toEqual({ visibility: 'organiser', status: 'draft', origin: 'hand' });
    const { rows: events } = await harness.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM domain_events
        WHERE type = 'draft.ops_applied' AND payload ->> 'version_id' = $1`,
      [after.versionId],
    );
    expect(events[0]?.n).toBe(1);
    // The draft she fixed was replaced, and the pair the fix left next to each other kept its leg.
    const { rows: legs } = await harness.pool.query(
      'SELECT from_key, to_key, minutes, source, day_id FROM plan_legs WHERE trip_id = $1',
      [crew.tripId],
    );
    expect(legs).toEqual([
      {
        from_key: stops.market,
        to_key: stops.lake,
        minutes: 4,
        source: 'valhalla',
        day_id: after.dayId,
      },
    ]);

    // The same tap again names the draft before: stale, nothing changes.
    const again = await harness.run(crew.organiser, 'apply_draft_check_fix', payload);
    expect(again.status).not.toBe(200);
    expect((await draft()).versionId).toBe(after.versionId);
  });

  it('refuses a fix that would put the stop on top of another, and leaves the draft', async () => {
    const before = await draft();
    const refused = await harness.run(crew.organiser, 'apply_draft_check_fix', {
      issue_id: await issue(at(15), 10, 30),
      base_version: before.versionId,
    });
    expect(errorOf(refused)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'fix_would_clash' },
    });
    expect((await draft()).versionId).toBe(before.versionId);
    expect(await lakeStarts(before.versionId)).toBe(at(15));
  });

  it('refuses an issue of a draft that is no longer the draft', async () => {
    const before = await draft();
    const old = await issue(at(15), 16);
    const moved = await harness.run(crew.organiser, 'apply_draft_ops', {
      trip_id: crew.tripId,
      base_version: before.versionId,
      ops: [{ op: 'move', item: stops.lake, new: { starts_at: at(17), ends_at: at(18) } }],
    });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    const latest = (await draft()).versionId;
    // The issue row may be gone with the draft it was found on, or name it still: either way no fix.
    const stale = await harness.run(crew.organiser, 'apply_draft_check_fix', {
      issue_id: old,
      base_version: before.versionId,
    });
    expect(stale.status).not.toBe(200);
    expect((await draft()).versionId).toBe(latest);
    expect(await lakeStarts(latest)).toBe(at(17));
  });
});
