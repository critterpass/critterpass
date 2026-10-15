/**
 * The plan a start scenario's organiser makes by hand (./scenario-trip.ts): the dates locked, two
 * stops a day at real editorial places of Đà Nẵng, and the plan taken to review. The places are
 * whatever the database recommends first (the shared order: brief essentials, must-sees, then the
 * curated set), or for the long real data those without photos and with the longest names; never
 * rows made here. A database without enough editorial places refuses the seed.
 */
import { recommendedOrderSql } from '@cp/db';
import { DomainError, generateUuidV7 } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { applyDraftOpsCommand } from '../commands/draft/apply-draft-ops';
import { ensurePlanDaysCommand } from '../commands/draft/ensure-plan-days';
import { reviewHandPlanCommand } from '../commands/draft/review-hand-plan';
import { lockTripDatesCommand } from '../commands/setup/lock-trip-dates';
import { playCommand, type SeedCaller } from './play-command';

export const SCENARIO_DESTINATION = 'da-nang';
/** Việt Nam keeps one offset all year, so local times are written with it. */
export const SCENARIO_TZ = 'Asia/Ho_Chi_Minh';
const OFFSET = '+07:00';
export const TRIP_DAYS = 3;
const STOPS_PER_DAY = 2;
/** Categories that read as a place to spend part of a day at. */
const STOP_CATEGORIES = ['beach', 'nature', 'temple_shrine', 'museum', 'market'];
const STOP_HOURS = [
  ['09:30', '11:30'],
  ['15:00', '17:00'],
] as const;

export function localDate(now: Date, days: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SCENARIO_TZ }).format(
    new Date(now.getTime() + days * 86_400_000),
  );
}

export const at = (date: string, time: string) => new Date(`${date}T${time}:00${OFFSET}`);

interface Place {
  readonly id: string;
  readonly category: string;
}

/** How a hand-made plan is laid out. */
export interface HandPlanShape {
  readonly days: number;
  /**
   * `recommended`: the shared recommended order among places to spend part of a day at;
   * `long_names`: any editorial place, those without photos first, then the longest names (the
   * long real data a layout must hold).
   */
  readonly order: 'recommended' | 'long_names';
}

const DEFAULT_SHAPE: HandPlanShape = { days: TRIP_DAYS, order: 'recommended' };

async function recommendedPlaces(
  tx: pg.PoolClient,
  tripId: string,
  shape: HandPlanShape,
): Promise<Place[]> {
  const order =
    shape.order === 'long_names'
      ? `EXISTS (SELECT 1 FROM poi_foursquare_photos f WHERE f.poi_id = p.id),
         char_length(p.name) DESC`
      : recommendedOrderSql('p');
  const places = await asSystemRole(tx, async () => {
    const { rows } = await tx.query<Place>(
      `SELECT p.id, p.category FROM pois p
        WHERE p.destination_id = (SELECT destination_id FROM trips WHERE id = $1)
          AND p.curation = 'editorial' AND p.status = 'active' AND p.merged_into_id IS NULL
          AND ($2::text[] IS NULL OR p.category = ANY ($2::text[]))
        ORDER BY ${order}, p.name, p.id
        LIMIT $3`,
      [tripId, shape.order === 'long_names' ? null : STOP_CATEGORIES, shape.days * STOPS_PER_DAY],
    );
    return rows;
  });
  if (places.length < shape.days) {
    throw new DomainError('STATE_INVALID', {
      reason: 'no_editorial_places',
      slug: SCENARIO_DESTINATION,
      found: places.length,
    });
  }
  return places;
}

/** Dates, the stops and the review: the trip ends in draft review with her plan as its draft. */
export async function planByHand(
  tx: pg.PoolClient,
  who: SeedCaller,
  tripId: string,
  startDate: string,
  shape: HandPlanShape = DEFAULT_SHAPE,
): Promise<void> {
  const { days } = shape;
  const dates = Array.from({ length: days }, (_, day) =>
    new Date(Date.parse(startDate) + day * 86_400_000).toISOString().slice(0, 10),
  );
  await playCommand(
    tx,
    lockTripDatesCommand,
    { trip_id: tripId, start: startDate, end: dates[days - 1] },
    who,
  );
  const empty = await playCommand(tx, ensurePlanDaysCommand, { trip_id: tripId }, who);
  const places = await recommendedPlaces(tx, tripId, shape);
  const ops = places.map((place, index) => {
    const date = dates[index % days] as string;
    // The first day's worth fill the mornings, the next the afternoons.
    const [from, to] = STOP_HOURS[Math.floor(index / days)] ?? STOP_HOURS[0];
    return {
      op: 'add' as const,
      item: generateUuidV7(),
      new: {
        day_no: (index % days) + 1,
        starts_at: at(date, from).toISOString(),
        ends_at: at(date, to).toISOString(),
        tz: SCENARIO_TZ,
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
