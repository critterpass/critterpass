/**
 * Wallet bookings on the plan, on the real stack. A crew booking added to a trip with a plan lands
 * on its day as an anchored item in a new plan version the crew hears about; an edit that leaves
 * the plan as it is makes no version, one that moves the booking moves its item, and deleting it
 * takes the item away. A personal flight shows the crew its leg and nothing else, one item per leg
 * on the trip's days, and leaves the plan when its owner hides it. A personal booking never reaches
 * the plan until it is shared, and leaves when it is taken back. A draft in review takes the item
 * in place, and locking the plan in puts the bookings already in the wallet on the plan.
 */
import { withSystem, withUser } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerProposalCommands } from '../../src/commands/proposal';
import { buildMoneyCrew, type MoneyCrew, type MoneyHarness } from '../money/money-harness';
import { seedCurrentPlan, tokyo, type SeededPlan } from '../plan/plan-fixture';
import type { SignedIn } from '../setup/setup-harness';
import { startBookingsHarness } from './bookings-harness';

let harness: MoneyHarness;
let crew: MoneyCrew;
let plan: SeededPlan;

interface ItemRow {
  stable_id: string;
  version_id: string;
  day_no: number;
  category: string;
  starts_at: Date;
  ends_at: Date;
  tz: string;
  attendee_ids: string[];
  notes: string;
  status: string;
  locked_reason: string;
}

const members = () => crew.members as [SignedIn, SignedIn, SignedIn];
const date = (index: number) => plan.dates[index] as string;

async function tripPlan(tripId: string): Promise<{ current: string | null; versions: number }> {
  const { rows } = await harness.pool.query<{ current: string | null; versions: number }>(
    `SELECT current_version_id AS current,
            (SELECT count(*)::int FROM itinerary_versions v WHERE v.trip_id = t.id) AS versions
       FROM trips t WHERE id = $1`,
    [tripId],
  );
  return rows[0]!;
}

/** The booking's items on the version, in time order. */
async function itemsOf(bookingId: string, versionId: string | null): Promise<ItemRow[]> {
  const { rows } = await harness.pool.query<ItemRow>(
    `SELECT i.stable_id, i.version_id, d.day_no, i.category, i.starts_at, i.ends_at, i.tz,
            i.attendee_ids, i.notes, i.status, i.locked_reason
       FROM plan_items i JOIN plan_days d ON d.id = i.day_id
      WHERE i.booking_id = $1 AND i.version_id = $2 ORDER BY i.starts_at`,
    [bookingId, versionId],
  );
  return rows;
}

async function run(who: SignedIn, cmd: string, payload: unknown): Promise<void> {
  const response = await harness.run(who, cmd, payload);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
}

function stay(extra: Record<string, unknown> = {}) {
  const [organiser, maya] = members();
  return {
    booking_id: generateUuidV7(),
    trip_id: crew.tripId,
    kind: 'stay',
    title: 'Machiya Gion',
    starts_at: tokyo(date(1), 15),
    ends_at: tokyo(date(2), 11),
    tz: 'Asia/Tokyo',
    traveller_ids: [organiser.uid, maya.uid],
    ...extra,
  };
}

function flight(extra: Record<string, unknown> = {}) {
  return {
    booking_id: generateUuidV7(),
    trip_id: crew.tripId,
    kind: 'flight',
    title: 'Anniversary surprise',
    tz: 'Asia/Tokyo',
    segments: [
      {
        carrier: 'JL',
        flight_no: '221',
        dep_airport: 'HND',
        arr_airport: 'ITM',
        sched_dep_at: tokyo(date(0), 7),
        sched_arr_at: tokyo(date(0), 8),
      },
      {
        carrier: 'JL',
        flight_no: '228',
        dep_airport: 'ITM',
        arr_airport: 'HND',
        // Four days after the plan's last day.
        sched_dep_at: new Date(Date.parse(tokyo(date(2), 19)) + 4 * 86_400_000).toISOString(),
      },
    ],
    ...extra,
  };
}

beforeAll(async () => {
  harness = await startBookingsHarness((registry) => registerProposalCommands(registry));
  crew = await buildMoneyCrew(harness, 3);
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('a crew booking on a trip with a plan', () => {
  let booking: ReturnType<typeof stay>;
  let stableId: string;

  it('lands on its day as an anchored item in a new plan version', async () => {
    const [organiser, maya, alex] = members();
    booking = stay();
    await run(alex, 'add_booking', booking);
    const after = await tripPlan(crew.tripId);
    expect(after.current).not.toBe(plan.versionId);
    const items = await itemsOf(booking.booking_id, after.current);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    stableId = item.stable_id;
    expect(item).toMatchObject({
      day_no: 2,
      category: 'stay',
      tz: 'Asia/Tokyo',
      notes: 'Machiya Gion',
      status: 'confirmed',
      locked_reason: 'booking',
    });
    expect(item.starts_at.toISOString()).toBe(tokyo(date(1), 15));
    // The check-in is a moment on its day, not the nights that follow.
    expect(item.ends_at.getTime() - item.starts_at.getTime()).toBe(30 * 60_000);
    expect([...item.attendee_ids].sort()).toEqual([organiser.uid, maya.uid].sort());
    // The rest of the plan came along, and the crew is told as for any plan edit.
    const { rows: kept } = await harness.pool.query(
      'SELECT 1 FROM plan_items WHERE version_id = $1 AND stable_id = ANY ($2::uuid[])',
      [after.current, [plan.walk, plan.dinner, plan.museum]],
    );
    expect(kept).toHaveLength(3);
    const { rows: events } = await harness.pool.query(
      `SELECT 1 FROM domain_events WHERE type = 'plan.ops_applied' AND trip_id = $1
          AND payload->>'version_id' = $2`,
      [crew.tripId, after.current],
    );
    expect(events).toHaveLength(1);
  });

  it('makes no plan version when an edit leaves the plan as it is', async () => {
    const [, , alex] = members();
    const before = await tripPlan(crew.tripId);
    await run(alex, 'edit_booking', {
      booking_id: booking.booking_id,
      base_version: 1,
      patch: { supplier_ref: 'GION-42' },
    });
    expect(await tripPlan(crew.tripId)).toEqual(before);
    expect(await itemsOf(booking.booking_id, before.current)).toHaveLength(1);
  });

  it('moves the item when the booking moves, keeping the one item', async () => {
    const [, , alex] = members();
    await run(alex, 'edit_booking', {
      booking_id: booking.booking_id,
      base_version: 2,
      patch: { starts_at: tokyo(date(2), 14), ends_at: tokyo(date(2), 20) },
    });
    const after = await tripPlan(crew.tripId);
    const items = await itemsOf(booking.booking_id, after.current);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ stable_id: stableId, day_no: 3 });
    expect(items[0]!.starts_at.toISOString()).toBe(tokyo(date(2), 14));
  });

  it('gives a booking outside the trip days no item and no plan version', async () => {
    const [organiser] = members();
    const before = await tripPlan(crew.tripId);
    const late = stay({
      kind: 'activity',
      title: 'Sumo morning practice',
      starts_at: new Date(Date.parse(tokyo(date(2), 9)) + 86_400_000).toISOString(),
      ends_at: undefined,
    });
    await run(organiser, 'add_booking', late);
    expect(await tripPlan(crew.tripId)).toEqual(before);
    expect(await itemsOf(late.booking_id, before.current)).toHaveLength(0);
  });

  it('takes the item away when the booking is deleted', async () => {
    const [, , alex] = members();
    await run(alex, 'delete_booking', { booking_id: booking.booking_id, base_version: 3 });
    const after = await tripPlan(crew.tripId);
    expect(await itemsOf(booking.booking_id, after.current)).toHaveLength(0);
    const { rows } = await harness.pool.query(
      'SELECT 1 FROM plan_items WHERE version_id = $1 AND stable_id = ANY ($2::uuid[])',
      [after.current, [plan.walk, plan.dinner, plan.museum]],
    );
    expect(rows).toHaveLength(3);
  });
});

describe('what the crew may see', () => {
  it('shows a personal flight as its leg, one item per leg on the trip days', async () => {
    const [organiser, maya] = members();
    const payload = flight();
    await run(organiser, 'add_booking', payload);
    const { current } = await tripPlan(crew.tripId);
    const items = await itemsOf(payload.booking_id, current);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      day_no: 1,
      category: 'flight',
      notes: 'JL 221 · HND → ITM',
      attendee_ids: [organiser.uid],
      locked_reason: 'booking',
    });
    expect(items[0]!.ends_at.toISOString()).toBe(tokyo(date(0), 8));
    // A crewmate reads the leg on the plan, and never the booking's own title.
    const seen = await withUser(harness.pool, maya.uid, 'test', async (tx) => {
      const { rows } = await tx.query<{ notes: string }>(
        'SELECT notes FROM plan_items WHERE version_id = $1 AND booking_id = $2',
        [current, payload.booking_id],
      );
      return rows;
    });
    expect(seen).toEqual([{ notes: 'JL 221 · HND → ITM' }]);
    const { rows: leaked } = await harness.pool.query(
      "SELECT 1 FROM plan_items WHERE trip_id = $1 AND notes LIKE '%Anniversary%'",
      [crew.tripId],
    );
    expect(leaked).toHaveLength(0);

    // Hidden from the crew: off the plan. Shown again: back as the same item.
    const stableId = items[0]!.stable_id;
    await run(organiser, 'set_flight_crew_visibility', {
      booking_id: payload.booking_id,
      visible: false,
    });
    const hidden = await tripPlan(crew.tripId);
    expect(await itemsOf(payload.booking_id, hidden.current)).toHaveLength(0);
    await run(organiser, 'set_flight_crew_visibility', {
      booking_id: payload.booking_id,
      visible: true,
    });
    const shown = await tripPlan(crew.tripId);
    const back = await itemsOf(payload.booking_id, shown.current);
    expect(back.map((item) => item.stable_id)).toEqual([stableId]);
  });

  it('keeps a personal booking off the plan until it is shared, and takes it back', async () => {
    const [organiser, maya] = members();
    const before = await tripPlan(crew.tripId);
    const payload = stay({ title: 'Ryokan for one', traveller_ids: [maya.uid] });
    await run(maya, 'add_booking', payload);
    // Personal by default: no item in any version, and no new plan version.
    expect(await tripPlan(crew.tripId)).toEqual(before);
    const { rows: placed } = await harness.pool.query(
      'SELECT 1 FROM plan_items WHERE booking_id = $1',
      [payload.booking_id],
    );
    expect(placed).toHaveLength(0);

    await run(maya, 'set_booking_visibility', {
      booking_id: payload.booking_id,
      visibility: 'crew',
    });
    const shared = await tripPlan(crew.tripId);
    const seen = await withUser(harness.pool, organiser.uid, 'test', async (tx) => {
      const { rows } = await tx.query<{ notes: string }>(
        'SELECT notes FROM plan_items WHERE version_id = $1 AND booking_id = $2',
        [shared.current, payload.booking_id],
      );
      return rows;
    });
    expect(seen).toEqual([{ notes: 'Ryokan for one' }]);

    await run(maya, 'set_booking_visibility', {
      booking_id: payload.booking_id,
      visibility: 'personal',
    });
    const taken = await tripPlan(crew.tripId);
    expect(await itemsOf(payload.booking_id, taken.current)).toHaveLength(0);
  });
});

describe('a trip whose plan is still a draft', () => {
  let solo: MoneyCrew;
  let draftId: string;
  let early: ReturnType<typeof flight>;

  /** An organiser draft with the plan's three dated days and one stop, in review. */
  async function seedDraft(tripId: string): Promise<string> {
    return withSystem(harness.pool, async (tx) => {
      for (const status of ['setup', 'drafting', 'draft_review']) {
        await tx.query('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
      }
      await tx.query('UPDATE trips SET start_date = $2 WHERE id = $1', [tripId, date(0)]);
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO itinerary_versions (trip_id, visibility, status)
         VALUES ($1, 'organiser', 'draft') RETURNING id`,
        [tripId],
      );
      const versionId = rows[0]!.id;
      for (const [index, day] of plan.dates.entries()) {
        const { rows: days } = await tx.query<{ id: string }>(
          `INSERT INTO plan_days (version_id, trip_id, day_no, date, theme)
           VALUES ($1, $2, $3, $4, 'Draft day') RETURNING id`,
          [versionId, tripId, index + 1, day],
        );
        if (index > 0) continue;
        await tx.query(
          `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
             category) VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Tokyo', 'sight')`,
          [versionId, days[0]!.id, tripId, generateUuidV7(), tokyo(day, 10), tokyo(day, 12)],
        );
      }
      await tx.query('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [tripId, versionId]);
      return versionId;
    });
  }

  beforeAll(async () => {
    solo = await buildMoneyCrew(harness, 1);
  });

  it('puts bookings already in the wallet on the plan when it is locked in', async () => {
    // Added before any plan exists: the wallet holds it, there is no plan to put it on.
    early = flight({ trip_id: solo.tripId });
    await run(solo.organiser, 'add_booking', early);
    const { rows: none } = await harness.pool.query(
      'SELECT 1 FROM plan_items WHERE booking_id = $1',
      [early.booking_id],
    );
    expect(none).toHaveLength(0);
    draftId = await seedDraft(solo.tripId);

    // Added while the draft is in review: written into the draft itself, with no new version.
    const transfer = stay({
      trip_id: solo.tripId,
      kind: 'transfer',
      title: 'Airport car',
      starts_at: tokyo(date(0), 9),
      ends_at: undefined,
      traveller_ids: [solo.organiser.uid],
      visibility: 'crew',
    });
    await run(solo.organiser, 'add_booking', transfer);
    expect(await tripPlan(solo.tripId)).toEqual({ current: null, versions: 1 });
    const inDraft = await itemsOf(transfer.booking_id, draftId);
    expect(inDraft).toHaveLength(1);
    expect(inDraft[0]).toMatchObject({ day_no: 1, category: 'transfer', locked_reason: 'booking' });
    // The flight added before the draft is there too: every booking command brings the whole
    // draft in line.
    expect(await itemsOf(early.booking_id, draftId)).toHaveLength(1);
    // A draft that lost the item (a restored older draft) gets it back when it is published.
    await harness.pool.query('DELETE FROM plan_items WHERE version_id = $1 AND booking_id = $2', [
      draftId,
      early.booking_id,
    ]);

    await run(solo.organiser, 'lock_in_plan', { trip_id: solo.tripId });
    const locked = await tripPlan(solo.tripId);
    expect(locked).toEqual({ current: draftId, versions: 1 });
    const flights = await itemsOf(early.booking_id, draftId);
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({
      day_no: 1,
      category: 'flight',
      notes: 'JL 221 · HND → ITM',
      attendee_ids: [solo.organiser.uid],
    });
    expect(await itemsOf(transfer.booking_id, draftId)).toHaveLength(1);
    const { rows: all } = await harness.pool.query(
      'SELECT 1 FROM plan_items WHERE version_id = $1',
      [draftId],
    );
    expect(all).toHaveLength(3);
  });

  it('goes through a new plan version once the plan is locked in', async () => {
    const activity = stay({
      trip_id: solo.tripId,
      kind: 'activity',
      title: 'Tea ceremony',
      starts_at: tokyo(date(1), 10),
      ends_at: tokyo(date(1), 12),
      traveller_ids: [solo.organiser.uid],
      visibility: 'crew',
    });
    await run(solo.organiser, 'add_booking', activity);
    const after = await tripPlan(solo.tripId);
    expect(after.versions).toBe(2);
    expect(after.current).not.toBe(draftId);
    const items = await itemsOf(activity.booking_id, after.current);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ day_no: 2, category: 'activity' });
    expect(items[0]!.ends_at.toISOString()).toBe(tokyo(date(1), 12));
    // The flight and the transfer were carried into the new version, once each.
    expect(await itemsOf(early.booking_id, after.current)).toHaveLength(1);
  });
});
