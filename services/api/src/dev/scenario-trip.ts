/**
 * The Đà Nẵng trip of the start scenarios, built as its organiser would build it by hand, through
 * the app's own commands (./play-command.ts): the dates are locked, six stops at real editorial
 * places go on a three-day plan (two a day), and the plan is taken to review (`draft`). From there
 * it is locked in alone, five crewmates join the locked trip, and money and bookings are added
 * (`locked`); a trip on today is then started (`under_way`). No AI runs: the plan is hers.
 *
 * The places are whatever the database recommends first among Đà Nẵng's editorial places (the
 * shared order: brief essentials, must-sees, then the curated set), never rows made here, so a
 * phone that only carries a destination's recommended places can show every stop. A database
 * without the destination or without enough editorial places refuses the seed.
 */
import { appendDomainEvent, moveTripStatus, recommendedOrderSql } from '@cp/db';
import { DomainError, generateUuidV7, type FlightSegmentInput } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { insertBooking, type NewBooking } from '../bookings/booking-writer';
import { syncBookedPlanItems } from '../bookings/plan-sync';
import { applyDraftOpsCommand } from '../commands/draft/apply-draft-ops';
import { ensurePlanDaysCommand } from '../commands/draft/ensure-plan-days';
import { reviewHandPlanCommand } from '../commands/draft/review-hand-plan';
import { addExpenseCommand } from '../commands/money/add-expense';
import { lockInPlanCommand } from '../commands/proposal/lock-in-plan';
import { lockTripDatesCommand } from '../commands/setup/lock-trip-dates';
import { startTripCommand } from '../commands/trips/start-trip';
import { playCommand, type SeedCaller } from './play-command';
import { addScenarioCrewmates } from './scenario-crew';

export const SCENARIO_DESTINATION = 'da-nang';
/** Việt Nam keeps one offset all year, so local times are written with it. */
const TZ = 'Asia/Ho_Chi_Minh';
const OFFSET = '+07:00';
export const SCENARIO_CURRENCY = 'VND';
const TRIP_DAYS = 3;
const STOPS_PER_DAY = 2;
/** Categories that read as a place to spend part of a day at. */
const STOP_CATEGORIES = ['beach', 'nature', 'temple_shrine', 'museum', 'market'];
const STOP_HOURS = [
  ['09:30', '11:30'],
  ['15:00', '17:00'],
] as const;

export type TripStage = 'draft' | 'locked' | 'under_way';

export interface ScenarioTripInput {
  readonly crewId: string;
  readonly stage: TripStage;
  /** Days from today (in Đà Nẵng) to the trip's first day. */
  readonly startsInDays: number;
  /** The organiser flies in on the first morning. */
  readonly withFlight: boolean;
}

function localDate(now: Date, days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(
    new Date(now.getTime() + days * 86_400_000),
  );
}

const at = (date: string, time: string) => new Date(`${date}T${time}:00${OFFSET}`);

interface Place {
  readonly id: string;
  readonly category: string;
}

async function createTrip(tx: pg.PoolClient, who: SeedCaller, crewId: string): Promise<string> {
  const tripId = generateUuidV7();
  await asSystemRole(tx, async () => {
    const { rows } = await tx.query<{ destination_id: string }>(
      `INSERT INTO trips (id, crew_id, status, destination_id, seat_cap, guide_id, is_guest_guide,
         tz, local_currency)
       SELECT $1, $2, 'voting', d.id, 6, app.destination_guide_id(d.id), d.coverage = 'guest',
              coalesce(d.tz, $4), coalesce(d.currency, $5)
         FROM destinations d WHERE d.slug = $3
       RETURNING destination_id`,
      [tripId, crewId, SCENARIO_DESTINATION, TZ, SCENARIO_CURRENCY],
    );
    const destinationId = rows[0]?.destination_id;
    if (destinationId === undefined) {
      throw new DomainError('STATE_INVALID', {
        reason: 'no_destination',
        slug: SCENARIO_DESTINATION,
      });
    }
    await tx.query(
      `INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')`,
      [tripId, who.uid],
    );
    const events = [
      { type: 'trip.created', payload: { trip_id: tripId, crew_id: crewId } },
      { type: 'trip.status_changed', payload: { trip_id: tripId, from: null, to: 'voting' } },
      { type: 'trip.destination_set', payload: { trip_id: tripId, destination_id: destinationId } },
    ] as const;
    for (const event of events) {
      await appendDomainEvent(tx, {
        type: event.type,
        aggregateKind: 'trip',
        aggregateId: tripId,
        actorKind: 'user',
        actorId: who.uid,
        payload: event.payload,
        crewId,
        tripId,
      });
    }
    // The vote is skipped: the place won, and the organiser opens setup.
    const actor = { kind: 'user' as const, id: who.uid };
    await moveTripStatus(tx, { tripId, from: 'voting', to: 'won', actor });
    await moveTripStatus(tx, { tripId, from: 'won', to: 'setup', actor });
  });
  return tripId;
}

async function recommendedPlaces(tx: pg.PoolClient, tripId: string): Promise<Place[]> {
  const places = await asSystemRole(tx, async () => {
    const { rows } = await tx.query<Place>(
      `SELECT p.id, p.category FROM pois p
        WHERE p.destination_id = (SELECT destination_id FROM trips WHERE id = $1)
          AND p.curation = 'editorial' AND p.status = 'active' AND p.merged_into_id IS NULL
          AND p.category = ANY ($2::text[])
        ORDER BY ${recommendedOrderSql('p')}, p.name, p.id
        LIMIT $3`,
      [tripId, STOP_CATEGORIES, TRIP_DAYS * STOPS_PER_DAY],
    );
    return rows;
  });
  if (places.length < TRIP_DAYS) {
    throw new DomainError('STATE_INVALID', {
      reason: 'no_editorial_places',
      slug: SCENARIO_DESTINATION,
      found: places.length,
    });
  }
  return places;
}

/** Dates, the stops and the review: the trip ends in draft review with her plan as its draft. */
async function planByHand(
  tx: pg.PoolClient,
  who: SeedCaller,
  tripId: string,
  startDate: string,
): Promise<void> {
  const dates = Array.from({ length: TRIP_DAYS }, (_, day) =>
    new Date(Date.parse(startDate) + day * 86_400_000).toISOString().slice(0, 10),
  );
  await playCommand(
    tx,
    lockTripDatesCommand,
    { trip_id: tripId, start: startDate, end: dates[TRIP_DAYS - 1] },
    who,
  );
  const empty = await playCommand(tx, ensurePlanDaysCommand, { trip_id: tripId }, who);
  const places = await recommendedPlaces(tx, tripId);
  const ops = places.map((place, index) => {
    const date = dates[index % TRIP_DAYS] as string;
    // The first three fill the mornings, the next three the afternoons.
    const [from, to] = STOP_HOURS[Math.floor(index / TRIP_DAYS)] ?? STOP_HOURS[0];
    return {
      op: 'add' as const,
      item: generateUuidV7(),
      new: {
        day_no: (index % TRIP_DAYS) + 1,
        starts_at: at(date, from).toISOString(),
        ends_at: at(date, to).toISOString(),
        tz: TZ,
        poi_id: place.id,
        category: place.category,
        attendee_ids: [],
      },
    };
  });
  const planned = await playCommand(
    tx,
    applyDraftOpsCommand,
    { trip_id: tripId, base_version: empty.version_id, ops },
    who,
  );
  await playCommand(
    tx,
    reviewHandPlanCommand,
    { trip_id: tripId, base_version: planned.version_id },
    who,
  );
}

async function addMoney(
  tx: pg.PoolClient,
  who: SeedCaller,
  tripId: string,
  crewmates: readonly string[],
): Promise<void> {
  const everyone = [who.uid, ...crewmates].map((uid) => ({ user_id: uid }));
  const expenses = [
    { payer: who.uid, amount: 900_000, category: 'food', description: 'Mì Quảng lunch' },
    {
      payer: crewmates[0] ?? who.uid,
      amount: 300_000,
      category: 'transit',
      description: 'Ride from the airport',
    },
  ];
  for (const expense of expenses) {
    await playCommand(
      tx,
      addExpenseCommand,
      {
        expense_id: generateUuidV7(),
        trip_id: tripId,
        amount_minor: expense.amount,
        currency: SCENARIO_CURRENCY,
        payer_uid: expense.payer,
        split: { mode: 'equal', shares: everyone },
        category: expense.category,
        description: expense.description,
      },
      who,
    );
  }
}

function booking(
  who: SeedCaller,
  trip: { readonly tripId: string; readonly crewId: string },
  fields: Pick<NewBooking, 'kind' | 'title' | 'startsAt' | 'endsAt' | 'travellerIds'> &
    Partial<NewBooking>,
): NewBooking {
  return {
    id: generateUuidV7(),
    tripId: trip.tripId,
    crewId: trip.crewId,
    ownerId: who.uid,
    tz: TZ,
    location: null,
    priceMinor: null,
    currency: null,
    paidBy: null,
    source: 'manual',
    supplier: 'other',
    supplierRef: null,
    freeCancelUntil: null,
    cancelPolicyText: null,
    visibility: 'crew',
    flightCrewVisible: true,
    details: {},
    barcode: null,
    segments: [],
    attachments: [],
    ...fields,
  };
}

async function addBookings(
  tx: pg.PoolClient,
  who: SeedCaller,
  trip: { readonly tripId: string; readonly crewId: string },
  startDate: string,
  crewmates: readonly string[],
  withFlight: boolean,
): Promise<void> {
  const lastDate = new Date(Date.parse(startDate) + (TRIP_DAYS - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const bookings: NewBooking[] = [
    booking(who, trip, {
      kind: 'stay',
      title: 'Demo Beach Stay',
      startsAt: at(startDate, '14:00'),
      endsAt: at(lastDate, '12:00'),
      location: 'Mỹ Khê, Đà Nẵng',
      travellerIds: [who.uid, ...crewmates],
      priceMinor: 5_400_000n,
      currency: SCENARIO_CURRENCY,
      paidBy: who.uid,
      details: { room: '3 twin rooms', guests: 6, check_in_time: '14:00', check_out_time: '12:00' },
    }),
  ];
  if (withFlight) {
    const segment: FlightSegmentInput = {
      carrier: 'VN',
      flight_no: '112',
      dep_airport: 'SGN',
      arr_airport: 'DAD',
      sched_dep_at: at(startDate, '07:00').toISOString(),
      sched_arr_at: at(startDate, '08:25').toISOString(),
    };
    bookings.push(
      booking(who, trip, {
        kind: 'flight',
        title: 'VN 112 SGN → DAD',
        startsAt: at(startDate, '07:00'),
        endsAt: at(startDate, '08:25'),
        travellerIds: [who.uid],
        supplier: 'airline',
        visibility: 'personal',
        segments: [segment],
      }),
    );
  }
  for (const row of bookings) {
    await insertBooking(tx, row, who.uid, who.now);
    await syncBookedPlanItems(tx, trip.tripId, who.uid);
  }
}

/** Builds the scenario's trip in the caller's crew; returns its id. */
export async function buildScenarioTrip(
  tx: pg.PoolClient,
  who: SeedCaller,
  input: ScenarioTripInput,
): Promise<string> {
  const startDate = localDate(who.now, input.startsInDays);
  const tripId = await createTrip(tx, who, input.crewId);
  await planByHand(tx, who, tripId, startDate);
  if (input.stage === 'draft') return tripId;
  // Nobody else is in the crew yet, so the plan is locked in without a proposal going out.
  await playCommand(tx, lockInPlanCommand, { trip_id: tripId }, who);
  const crewmates = await addScenarioCrewmates(tx, input.crewId, tripId);
  if (input.stage === 'under_way') {
    await playCommand(tx, startTripCommand, { trip_id: tripId }, who);
  }
  await addMoney(tx, who, tripId, crewmates);
  await addBookings(
    tx,
    who,
    { tripId, crewId: input.crewId },
    startDate,
    crewmates,
    input.withFlight,
  );
  return tripId;
}
