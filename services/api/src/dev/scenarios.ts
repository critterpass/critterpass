/**
 * The start scenarios of `POST /v1/dev/seed-demo`, beside the demo world's five. Device flows ask
 * for one right after a fresh account is made, so a journey starts on the state it tests instead
 * of building it through the app:
 *
 * - `trip_today`: a Vietnamese crew of six (settling in đồng) on a locked three-day trip to
 *   Đà Nẵng that is on today, with a plan of editorial places, two expenses and a stay;
 * - `trip_tomorrow`: the same trip starting tomorrow, with the organiser's flight in that morning;
 * - `draft_ready`: a crew of one whose Đà Nẵng trip (two weeks out) has its plan waiting in review;
 * - `draft_today`: the same crew of one, its trip's first day today, so the trip it sends out can
 *   be under way the day it is locked in;
 * - `crew_with_code`: a crew of one with a live join code and no trip;
 * - `solo_today`: a crew of one on the same Đà Nẵng trip, on today, with its budget locked in đồng
 *   and nothing spent or booked (./scenario-solo-trip.ts);
 * - `solo_tomorrow`: that solo trip confirmed for tomorrow, already in `pre_trip`.
 *
 * Every answer carries the crew's join code. Each scenario has its own crew per caller, built in
 * one transaction; asking again answers the same crew and trip and builds nothing twice.
 */
import { withUser } from '@cp/db';
import type pg from 'pg';
import { z } from 'zod';

import type { RateLimitRedisClient } from '../abuse/rate-limits';
import { SEED_DEVICE_ID, type SeedCaller } from './play-command';
import { ensureScenarioCrew, SCENARIO_CREW_NAMES, scenarioCrewCode } from './scenario-crew';
import { buildSoloTrip, type SoloTripInput } from './scenario-solo-trip';
import { buildScenarioTrip, SCENARIO_CURRENCY, type ScenarioTripInput } from './scenario-trip';

export const startScenarioSchema = z.enum([
  'trip_today',
  'trip_tomorrow',
  'draft_ready',
  'draft_today',
  'crew_with_code',
  'solo_today',
  'solo_tomorrow',
]);
export type StartScenario = z.infer<typeof startScenarioSchema>;

export interface SeedStartResult {
  readonly crew_id: string;
  /** Absent for a crew without a trip. */
  readonly trip_id?: string;
  readonly scenario: StartScenario;
  readonly created: boolean;
  /** No scenario files inbox items; kept so every seed answer has the same shape. */
  readonly inbox_item_ids: readonly string[];
  /** The crew's live join code, for the people a flow brings in. */
  readonly code: string;
}

const TRIPS: Readonly<
  Record<Exclude<StartScenario, 'crew_with_code' | SoloScenario>, Omit<ScenarioTripInput, 'crewId'>>
> = {
  trip_today: { stage: 'under_way', startsInDays: 0, withFlight: false },
  trip_tomorrow: { stage: 'locked', startsInDays: 1, withFlight: true },
  draft_ready: { stage: 'draft', startsInDays: 14, withFlight: false },
  draft_today: { stage: 'draft', startsInDays: 0, withFlight: false },
};

type SoloScenario = 'solo_today' | 'solo_tomorrow';
const SOLO_TRIPS: Readonly<Record<SoloScenario, Omit<SoloTripInput, 'crewId'>>> = {
  solo_today: { stage: 'under_way', startsInDays: 0 },
  solo_tomorrow: { stage: 'pre_trip', startsInDays: 1 },
};

function isSolo(scenario: StartScenario): scenario is SoloScenario {
  return scenario in SOLO_TRIPS;
}

/** The trip a scenario builds in its crew, or none. */
function tripBuilder(
  scenario: StartScenario,
  redis: RateLimitRedisClient,
): ((tx: pg.PoolClient, who: SeedCaller, crewId: string) => Promise<string>) | undefined {
  if (scenario === 'crew_with_code') return undefined;
  if (isSolo(scenario)) {
    const solo = SOLO_TRIPS[scenario];
    return (tx, who, crewId) => buildSoloTrip(tx, who, { ...solo, crewId }, redis);
  }
  const trip = TRIPS[scenario];
  return (tx, who, crewId) => buildScenarioTrip(tx, who, { ...trip, crewId });
}

export async function seedStartScenario(
  pool: pg.Pool,
  who: SeedCaller,
  scenario: StartScenario,
  redis: RateLimitRedisClient,
): Promise<SeedStartResult> {
  return withUser(pool, who.uid, SEED_DEVICE_ID, async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`demo-seed:${who.uid}`]);
    const build = tripBuilder(scenario, redis);
    const crew = await ensureScenarioCrew(
      tx,
      who,
      SCENARIO_CREW_NAMES[scenario],
      build === undefined ? null : SCENARIO_CURRENCY,
    );
    const tripId =
      build === undefined ? undefined : (crew.tripId ?? (await build(tx, who, crew.crewId)));
    return {
      crew_id: crew.crewId,
      ...(tripId === undefined ? {} : { trip_id: tripId }),
      scenario,
      created: crew.created,
      inbox_item_ids: [],
      code: await scenarioCrewCode(tx, crew.crewId, who.now),
    };
  });
}
