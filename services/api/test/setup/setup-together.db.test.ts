/**
 * Setting a trip up together, on the real stack: each member's part shows to the crew as flags
 * (days in, max in) and their way there; members keep answering while the organiser reviews a
 * draft; an answer that lands on an untouched guide draft makes the guide draft again, while a
 * draft she edited by hand waits for her; she may draft again from the review herself, and a
 * draft she stops puts her back to reviewing the earlier one. How a member sleeps is kept with
 * their room chips.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDraftCommands } from '../../src/commands/draft';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from './setup-harness';

let harness: SetupHarness;

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function crewWithDates(size: number): Promise<SetupCrew> {
  const crew = await buildSetupCrew(harness, size);
  const locked = await harness.run(crew.organiser, 'lock_trip_dates', {
    trip_id: crew.tripId,
    start: day(30),
    end: day(34),
  });
  expect(locked.status).toBe(200);
  return crew;
}

async function memberSetup(tripId: string, uid: string) {
  const { rows } = await harness.pool.query<{
    days_in: boolean;
    max_in: boolean;
    way_mode: string | null;
    way_estimate_minor: string | null;
    way_currency: string | null;
    way_arrives_at: Date | null;
  }>(
    `SELECT days_in, max_in, way_mode, way_estimate_minor, way_currency, way_arrives_at
       FROM trip_member_setup WHERE trip_id = $1 AND user_id = $2`,
    [tripId, uid],
  );
  return rows[0];
}

/** Puts the trip in review of a draft made by `origin` ('guide' or 'hand'). */
async function inReview(tripId: string, origin: 'guide' | 'hand'): Promise<void> {
  await withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, visibility, status, origin)
       VALUES ($1, 'organiser', 'draft', $2) RETURNING id`,
      [tripId, origin],
    );
    if (origin === 'hand') {
      await tx.query(
        `INSERT INTO itinerary_versions (trip_id, visibility, status, origin)
         VALUES ($1, 'organiser', 'superseded', 'guide')`,
        [tripId],
      );
    }
    await tx.query("UPDATE trips SET status = 'drafting' WHERE id = $1", [tripId]);
    await tx.query(
      "UPDATE trips SET status = 'draft_review', draft_version_id = $2 WHERE id = $1",
      [tripId, rows[0]?.id],
    );
  });
}

async function tripState(tripId: string) {
  const { rows } = await harness.pool.query<{ status: string; drafts: number }>(
    `SELECT status, (SELECT count(*) FROM agent_jobs WHERE trip_id = $1 AND kind = 'draft')::int
              AS drafts
       FROM trips WHERE id = $1`,
    [tripId],
  );
  return rows[0];
}

const submitMax = (who: SignedIn, tripId: string) =>
  harness.run(who, 'submit_budget_max', {
    trip_id: tripId,
    amount_minor: 150_000,
    currency: 'USD',
  });

beforeAll(async () => {
  harness = await startSetupHarness(registerDraftCommands);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe("each member's part", () => {
  it('shows whose max and days are in, never what they are', async () => {
    const crew = await crewWithDates(3);
    const [, ray] = crew.members as [SignedIn, SignedIn];
    expect(resultOf(await submitMax(ray, crew.tripId))).toEqual({
      trip_id: crew.tripId,
      set: true,
    });
    const days = await harness.run(ray, 'set_availability', {
      trip_id: crew.tripId,
      days: [{ date: day(31), state: 'free', source: 'manual' }],
    });
    expect(days.status).toBe(200);
    expect(await memberSetup(crew.tripId, ray.uid)).toMatchObject({ days_in: true, max_in: true });
    expect(await memberSetup(crew.tripId, crew.organiser.uid)).toMatchObject({
      days_in: false,
      max_in: false,
    });
  });

  it('prices the way there from the stored estimate, or stands on their own booking', async () => {
    const crew = await crewWithDates(2);
    const [, ray] = crew.members as [SignedIn, SignedIn];
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `INSERT INTO destination_home_links
           (destination_id, origin_key, origin_name, status, ways, generated_at, expires_at)
         SELECT destination_id, 'SIN', 'Singapore', 'ready', $2, now(), now() + interval '30 days'
           FROM trips WHERE id = $1`,
        [
          crew.tripId,
          JSON.stringify([
            { mode: 'flight', minutes: 420, cost_pp_minor: 19_000, cost_currency: 'USD' },
          ]),
        ],
      ),
    );
    const arrives = `${day(30)}T16:00:00+09:00`;
    const set = await harness.run(ray, 'set_getting_there', {
      trip_id: crew.tripId,
      mode: 'flight',
      arrives_at: arrives,
    });
    expect(resultOf(set)).toEqual({
      trip_id: crew.tripId,
      mode: 'flight',
      estimate_minor: 19_000,
      currency: 'USD',
      minutes: 420,
    });
    const row = await memberSetup(crew.tripId, ray.uid);
    expect(row).toMatchObject({ way_mode: 'flight', way_estimate_minor: '19000' });
    expect(row?.way_arrives_at?.toISOString()).toBe(new Date(arrives).toISOString());

    const bookingId = await withSystem(harness.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO bookings (trip_id, owner_id, type, title, visibility)
         VALUES ($1, $2, 'flight', 'SQ 938', 'crew') RETURNING id`,
        [crew.tripId, crew.organiser.uid],
      );
      return rows[0]?.id as string;
    });
    expect(
      errorOf(
        await harness.run(ray, 'set_getting_there', {
          trip_id: crew.tripId,
          mode: 'flight',
          booking_id: bookingId,
        }),
      ),
    ).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'booking' } });
    const booked = await harness.run(crew.organiser, 'set_getting_there', {
      trip_id: crew.tripId,
      mode: 'flight',
      booking_id: bookingId,
    });
    expect(resultOf(booked)).toMatchObject({ estimate_minor: null, currency: null });
  });

  it('keeps how a member sleeps with their room chips', async () => {
    const crew = await crewWithDates(2);
    const [, ray] = crew.members as [SignedIn, SignedIn];
    const set = await harness.run(ray, 'set_room_prefs', {
      trip_id: crew.tripId,
      chips: ['light_sleeper', 'ground_floor'],
      sleep: 'own',
    });
    expect(set.status).toBe(200);
    await harness.run(ray, 'set_room_prefs', { trip_id: crew.tripId, chips: ['early_bird'] });
    const { rows } = await harness.pool.query<{ chips: string[]; sleep: string | null }>(
      'SELECT chips, sleep FROM room_prefs WHERE trip_id = $1 AND user_id = $2',
      [crew.tripId, ray.uid],
    );
    expect(rows[0]).toEqual({ chips: ['early_bird'], sleep: 'own' });
  });
});

describe('drafting as the answers come in', () => {
  it("drafts again when an answer lands on the guide's untouched draft", async () => {
    const crew = await crewWithDates(3);
    const [, ray] = crew.members as [SignedIn, SignedIn];
    await inReview(crew.tripId, 'guide');
    expect((await submitMax(ray, crew.tripId)).status).toBe(200);
    expect(await tripState(crew.tripId)).toEqual({ status: 'drafting', drafts: 1 });

    // Stopping that draft goes back to reviewing the earlier one.
    const stopped = await harness.run(crew.organiser, 'cancel_draft', { trip_id: crew.tripId });
    expect(stopped.status).toBe(200);
    expect((await tripState(crew.tripId))?.status).toBe('draft_review');
  });

  it('leaves a draft she edited by hand for her to draft again', async () => {
    const crew = await crewWithDates(3);
    const [, ray] = crew.members as [SignedIn, SignedIn];
    await inReview(crew.tripId, 'hand');
    expect((await submitMax(ray, crew.tripId)).status).toBe(200);
    expect(await tripState(crew.tripId)).toEqual({ status: 'draft_review', drafts: 0 });

    const again = await harness.run(crew.organiser, 'start_draft', { trip_id: crew.tripId });
    expect(again.status).toBe(200);
    expect(await tripState(crew.tripId)).toEqual({ status: 'drafting', drafts: 1 });
  });
});
