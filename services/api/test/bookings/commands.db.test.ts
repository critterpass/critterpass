/**
 * The wallet's manual commands on the real stack. A shared stay added with "split 3 ways" lands as
 * a booking and an expense in one transaction (or neither), with its deadline reminder armed and a
 * crew hint; someone outside the trip cannot add one, and a replay adds nothing twice. A flight is
 * personal with its legs visible to the crew and boarding estimated. The budget forecast counts a
 * booking until it is expensed. Only the owner or an organiser edits or deletes, against the
 * version they saw; deleting keeps the expense unless asked. The offline bundle gives the owner
 * their barcode and everyone signed document URLs.
 */
import { withUser } from '@cp/db';
import { generateUuidV7, getBookedCostProvider, type BookedCost } from '@cp/domain';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerBookedCosts } from '../../src/bookings/booked-costs';
import type { MoneyCrew, MoneyHarness } from '../money/money-harness';
import { buildMoneyCrew } from '../money/money-harness';
import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
import { docKey, get, startBookingsHarness } from './bookings-harness';

let harness: MoneyHarness;
let crew: MoneyCrew;
let stayId: string;
let flightId: string;

const DEADLINE = new Date(Date.now() + 10 * 86_400_000).toISOString();

beforeAll(async () => {
  harness = await startBookingsHarness();
  crew = await buildMoneyCrew(harness, 4);
  registerBookedCosts();
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const members = () => crew.members as [SignedIn, SignedIn, SignedIn, SignedIn];

function stay(extra: Record<string, unknown> = {}) {
  const [organiser, maya, alex] = members();
  return {
    booking_id: generateUuidV7(),
    trip_id: crew.tripId,
    kind: 'stay',
    title: 'Villa Tirta, Ubud',
    starts_at: '2026-10-12T07:00:00Z',
    ends_at: '2026-10-19T03:00:00Z',
    location: 'Jl. Raya Sayan, Ubud',
    traveller_ids: [organiser.uid, maya.uid, alex.uid],
    price: { amount_minor: 90_000, currency: 'USD' },
    supplier: 'agoda',
    supplier_ref: '1234567890',
    free_cancel_until: DEADLINE,
    cancel_policy_text: 'Free cancellation until 5 October 2026 23:59.',
    ...extra,
  };
}

async function bookedCosts(uid: string): Promise<readonly BookedCost[]> {
  const provider = getBookedCostProvider<pg.PoolClient>();
  if (provider === null) throw new Error('no booked-cost provider');
  return withUser(harness.pool, uid, 'test', (tx) => provider(tx, crew.tripId));
}

describe('adding a booking', () => {
  it('adds a shared stay and its split expense together, with its reminder and hint', async () => {
    const [organiser] = members();
    const expenseId = generateUuidV7();
    const payload = stay({
      split: { expense_id: expenseId },
      attachments: [{ media_key: docKey(organiser), kind: 'voucher' }],
      barcode: { format: 'qr', payload: 'AGODA-1234567890' },
    });
    stayId = payload.booking_id;
    const response = await harness.run(organiser, 'add_booking', payload);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(resultOf(response)).toEqual({ booking_id: stayId, version: 1, expense_id: expenseId });

    const { rows: booking } = await harness.pool.query<{ visibility: string; enc: string }>(
      'SELECT visibility, barcode_payload_enc AS enc FROM bookings WHERE id = $1',
      [stayId],
    );
    expect(booking[0]?.visibility).toBe('crew');
    expect(booking[0]?.enc).not.toContain('AGODA');
    const { rows: expense } = await harness.pool.query<{ source: string; booking_id: string }>(
      'SELECT source, booking_id FROM expenses WHERE id = $1',
      [expenseId],
    );
    expect(expense).toEqual([{ source: 'booking', booking_id: stayId }]);
    const shares = await harness.pool.query('SELECT 1 FROM expense_shares WHERE expense_id = $1', [
      expenseId,
    ]);
    expect(shares.rowCount).toBe(3);
    const timer = await harness.pool.query(
      "SELECT 1 FROM scheduled_events WHERE kind = 'booking.deadline_reminder' AND ref_id = $1",
      [stayId],
    );
    expect(timer.rowCount).toBe(1);
    const hint = await harness.pool.query(
      "SELECT 1 FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'booking.added'",
      [`crew_bookings:${crew.crewId}`],
    );
    expect(hint.rowCount).toBe(1);
  });

  it('adds neither the booking nor the expense when the split cannot be written', async () => {
    const [organiser] = members();
    const outsider = await harness.signIn();
    const payload = stay({
      split: { expense_id: generateUuidV7(), shares: [{ user_id: outsider.uid }] },
    });
    const response = await harness.run(organiser, 'add_booking', payload);
    expect(errorOf(response)).toMatchObject({
      code: 'VALIDATION',
      detail: { reason: 'not_in_trip' },
    });
    const left = await harness.pool.query('SELECT 1 FROM bookings WHERE id = $1', [
      payload.booking_id,
    ]);
    expect(left.rowCount).toBe(0);
  });

  it('refuses someone outside the trip, and travellers who are not on it', async () => {
    const outsider = await harness.signIn();
    const refused = await harness.run(outsider, 'add_booking', stay());
    expect(refused.status).toBe(404);
    const [organiser] = members();
    const stranger = await harness.run(
      organiser,
      'add_booking',
      stay({ traveller_ids: [outsider.uid] }),
    );
    expect(errorOf(stranger)).toMatchObject({
      code: 'VALIDATION',
      detail: { reason: 'not_in_trip' },
    });
  });

  it('replays an add as a duplicate without a second booking', async () => {
    const [, maya] = members();
    const opId = generateUuidV7();
    const payload = stay({ title: 'Replay stay', free_cancel_until: undefined });
    const first = await harness.run(maya, 'add_booking', payload, { opId });
    const again = await harness.run(maya, 'add_booking', payload, { opId });
    expect(first.status).toBe(200);
    expect(again.body['status']).toBe('duplicate');
    const rows = await harness.pool.query('SELECT 1 FROM bookings WHERE id = $1', [
      payload.booking_id,
    ]);
    expect(rows.rowCount).toBe(1);
  });

  it('keeps a flight personal, shows its legs to the crew and estimates boarding', async () => {
    const [organiser, maya] = members();
    flightId = generateUuidV7();
    const response = await harness.run(maya, 'add_booking', {
      booking_id: flightId,
      trip_id: crew.tripId,
      kind: 'flight',
      title: 'SQ 938 · Singapore → Denpasar',
      segments: [
        {
          carrier: 'SQ',
          flight_no: '938',
          dep_airport: 'SIN',
          arr_airport: 'DPS',
          sched_dep_at: '2026-10-12T01:40:00Z',
          sched_arr_at: '2026-10-12T04:10:00Z',
        },
      ],
      details: { seat: '32A' },
      barcode: { format: 'pdf417', payload: 'M1TAN/MAYA EABC123 SINDPSSQ 0938 285Y032A0001 100' },
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const seen = (uid: string) =>
      withUser(harness.pool, uid, 'test', async (tx) => ({
        booking: (await tx.query('SELECT 1 FROM bookings WHERE id = $1', [flightId])).rowCount,
        segments: (
          await tx.query<{ boarding_at: Date; boarding_estimated: boolean }>(
            'SELECT boarding_at, boarding_estimated FROM flight_segments WHERE booking_id = $1',
            [flightId],
          )
        ).rows,
      }));
    const crewView = await seen(organiser.uid);
    expect(crewView.booking).toBe(0);
    expect(crewView.segments).toEqual([
      { boarding_at: new Date('2026-10-12T01:00:00Z'), boarding_estimated: true },
    ]);
    const event = await harness.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'booking.flight_added' AND aggregate_id = $1",
      [flightId],
    );
    expect(event.rowCount).toBe(1);
  });
});

describe('the budget forecast', () => {
  it('counts a booking until it is expensed, and only crew bookings', async () => {
    const [organiser] = members();
    const unsplit = stay({ title: 'Nusa Penida boat', kind: 'boat', free_cancel_until: undefined });
    await harness.run(organiser, 'add_booking', unsplit);
    const costs = await bookedCosts(organiser.uid);
    const ids = costs.map((cost) => cost.bookingId);
    expect(ids).toContain(unsplit.booking_id);
    expect(ids).not.toContain(stayId);
    expect(ids).not.toContain(flightId);
    expect(costs.find((cost) => cost.bookingId === unsplit.booking_id)?.amountMinor).toBe(90_000n);
  });
});

describe('editing and deleting', () => {
  it('lets only the owner or an organiser edit, against the version they saw', async () => {
    const [organiser, maya, alex] = members();
    const hidden = await harness.run(organiser, 'edit_booking', {
      booking_id: flightId,
      base_version: 3,
      patch: { title: 'SQ 938' },
    });
    expect(hidden.status).toBe(404);
    const other = await harness.run(alex, 'edit_booking', {
      booking_id: stayId,
      base_version: 1,
      patch: { title: 'Mine now' },
    });
    expect(errorOf(other).code).toBe('FORBIDDEN');
    const conflict = await harness.run(organiser, 'edit_booking', {
      booking_id: stayId,
      base_version: 7,
      patch: { title: 'Villa Tirta' },
    });
    expect(errorOf(conflict)).toMatchObject({
      code: 'VERSION_CONFLICT',
      detail: { current_version: 1 },
    });
    const moved = await harness.run(maya, 'edit_booking', {
      booking_id: flightId,
      base_version: 1,
      patch: { clear: ['barcode'] },
    });
    expect(resultOf(moved)).toEqual({ booking_id: flightId, version: 2 });
    const ok = await harness.run(organiser, 'edit_booking', {
      booking_id: stayId,
      base_version: 1,
      patch: { title: 'Villa Tirta', clear: ['free_cancel_until'] },
    });
    expect(resultOf(ok)).toEqual({ booking_id: stayId, version: 2 });
    const timer = await harness.pool.query(
      `SELECT 1 FROM scheduled_events WHERE kind = 'booking.deadline_reminder' AND ref_id = $1
          AND status = 'pending'`,
      [stayId],
    );
    expect(timer.rowCount).toBe(0);
  });

  it('keeps the split expense on delete unless asked to delete it too', async () => {
    const [organiser] = members();
    const expenseId = generateUuidV7();
    const second = stay({ title: 'Second villa', split: { expense_id: expenseId } });
    await harness.run(organiser, 'add_booking', second);
    const kept = await harness.run(organiser, 'delete_booking', { booking_id: stayId });
    expect(kept.status).toBe(200);
    const live = await harness.pool.query(
      'SELECT deleted_at FROM expenses WHERE booking_id = $1 AND deleted_at IS NULL',
      [stayId],
    );
    expect(live.rowCount).toBe(1);
    const both = await harness.run(organiser, 'delete_booking', {
      booking_id: second.booking_id,
      delete_expense: true,
    });
    expect(both.status).toBe(200);
    const gone = await harness.pool.query(
      'SELECT 1 FROM expenses WHERE id = $1 AND deleted_at IS NOT NULL',
      [expenseId],
    );
    expect(gone.rowCount).toBe(1);
  });
});

describe('the offline bundle', () => {
  it('gives the owner their barcode and everyone signed document URLs', async () => {
    const [organiser, maya] = members();
    const pass = stay({
      title: 'Ubud cooking class',
      kind: 'activity',
      free_cancel_until: undefined,
      attachments: [{ media_key: docKey(organiser), kind: 'voucher' }],
      barcode: { format: 'qr', payload: 'KLOOK-778899' },
    });
    await harness.run(organiser, 'add_booking', pass);
    type Bundle = {
      sections: {
        bookings: {
          items: {
            booking_id: string;
            barcode: { payload: string } | null;
            attachments: { url: string | null }[];
          }[];
        };
      };
    };
    const own = (await get(harness, organiser, `/v1/trips/${crew.tripId}/offline-bundle`))
      .body as unknown as Bundle;
    const mine = own.sections.bookings.items.find((item) => item.booking_id === pass.booking_id);
    expect(mine?.barcode?.payload).toBe('KLOOK-778899');
    expect(mine?.attachments[0]?.url).toMatch(/^https:\/\/media\.test\//);
    const theirs = (await get(harness, maya, `/v1/trips/${crew.tripId}/offline-bundle`))
      .body as unknown as Bundle;
    const shared = theirs.sections.bookings.items.find(
      (item) => item.booking_id === pass.booking_id,
    );
    expect(shared?.barcode).toBeNull();
    expect(shared?.attachments).toHaveLength(1);
    const outsider = await harness.signIn();
    expect((await get(harness, outsider, `/v1/trips/${crew.tripId}/offline-bundle`)).status).toBe(
      404,
    );
  });
});

describe('sharing', () => {
  it('lets only the owner share a booking, and its documents follow', async () => {
    const [organiser, maya] = members();
    const refused = await harness.run(organiser, 'set_booking_visibility', {
      booking_id: flightId,
      visibility: 'crew',
    });
    expect(refused.status).toBe(404);
    const shared = await harness.run(maya, 'set_booking_visibility', {
      booking_id: flightId,
      visibility: 'crew',
    });
    expect(resultOf(shared)).toEqual({ booking_id: flightId, version: 3 });
    const seen = await withUser(harness.pool, organiser.uid, 'test', (tx) =>
      tx.query('SELECT 1 FROM bookings WHERE id = $1', [flightId]),
    );
    expect(seen.rowCount).toBe(1);
  });
});
