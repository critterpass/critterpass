/**
 * The trip settings reads on the real stack: the change-dates preview names who is free on every
 * new day and what the new dates do to each booking (fine inside them; outside, moved while free
 * cancelling lasts, lost after it, asked about with no deadline on record) and how many stops go
 * back to Ideas; the cancel summary lists refunds, money kept, money and chat staying, and who is
 * told. Someone outside the trip gets `NOT_FOUND`.
 */
import { withSystem } from '@cp/db';
import type { CancelSummaryResult, DatesImpactResult } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerTripSettingsReads } from '../../../src/planning/trip-settings/reads';
import {
  buildSetupCrew,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;
const ids: Record<string, string> = {};

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function get<T>(who: SignedIn, path: string): Promise<{ status: number; body: T }> {
  const response = await harness.request(path, { headers: { cookie: who.cookie } });
  return { status: response.status, body: (await response.json()) as T };
}

beforeAll(async () => {
  harness = await startSetupHarness(undefined, (app, deps) => registerTripSettingsReads(app, deps));
  crew = await buildSetupCrew(harness, 3);
  const [org, ray, dev] = crew.members as [SignedIn, SignedIn, SignedIn];
  expect(
    (
      await harness.run(org, 'lock_trip_dates', {
        trip_id: crew.tripId,
        start: day(30),
        end: day(34),
      })
    ).status,
  ).toBe(200);
  const newDays = [36, 37, 38].map((offset) => ({
    date: day(offset),
    state: 'free',
    source: 'manual',
  }));
  expect(
    (await harness.run(ray, 'set_availability', { trip_id: crew.tripId, days: newDays })).status,
  ).toBe(200);
  expect(
    (
      await harness.run(dev, 'set_availability', {
        trip_id: crew.tripId,
        days: [{ date: day(37), state: 'busy', source: 'manual' }],
      })
    ).status,
  ).toBe(200);
  await withSystem(harness.pool, async (tx) => {
    const add = async (key: string, offset: number, freeCancel: string | null) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO bookings (trip_id, owner_id, type, title, visibility, starts_at, tz,
           free_cancel_until, price_minor, currency)
         VALUES ($1, $2, 'stay', $3, 'crew', ($4::date + time '15:00') AT TIME ZONE 'Asia/Tokyo',
                 'Asia/Tokyo', $5, 42000, 'USD')
         RETURNING id`,
        [crew.tripId, org.uid, key, day(offset), freeCancel],
      );
      ids[key] = rows[0]?.id as string;
    };
    await add('inside', 37, null);
    await add('free', 31, new Date(Date.now() + 10 * 86_400_000).toISOString());
    await add('kept', 32, new Date(Date.now() - 86_400_000).toISOString());
    await add('unknown', 33, null);
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('the change-dates preview', () => {
  it('names who is free and what each booking does', async () => {
    const [, ray] = crew.members as [SignedIn, SignedIn];
    const { status, body } = await get<DatesImpactResult>(
      ray,
      `/v1/trips/${crew.tripId}/dates-impact?start=${day(36)}&end=${day(38)}`,
    );
    expect(status).toBe(200);
    expect(body.free).toEqual({ user_ids: [ray.uid], total: 3 });
    const impact = Object.fromEntries(
      body.bookings.map((b) => [b.title, [b.impact, b.kept_minor]]),
    );
    expect(impact).toEqual({
      inside: ['fine', null],
      free: ['moves', null],
      kept: ['lost', 42000],
      unknown: ['ask', null],
    });
    expect(body.to).toEqual({ start: day(36), end: day(38) });
  });

  it('refuses a range longer than a trip can be', async () => {
    const { status } = await get(
      crew.organiser,
      `/v1/trips/${crew.tripId}/dates-impact?start=${day(36)}&end=${day(80)}`,
    );
    expect(status).toBe(422);
  });

  it('is not found for someone outside the trip', async () => {
    const outsider = await harness.signIn();
    const { status } = await get(
      outsider,
      `/v1/trips/${crew.tripId}/dates-impact?start=${day(36)}&end=${day(38)}`,
    );
    expect(status).toBe(404);
  });
});

describe('the cancel summary', () => {
  it('lists refunds, money kept, questions, and what stays', async () => {
    const { status, body } = await get<CancelSummaryResult>(
      crew.organiser,
      `/v1/trips/${crew.tripId}/cancel-summary`,
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ trip_id: crew.tripId, cancellable: true, told_count: 2 });
    expect(body.consequences.map((c) => [c.kind, c.title, c.amount_minor])).toEqual([
      ['booking_refund', 'free', 42000],
      ['booking_kept', 'kept', 42000],
      ['booking_ask', 'unknown', null],
      ['booking_ask', 'inside', null],
      ['chat_stays', null, null],
    ]);
  });
});
