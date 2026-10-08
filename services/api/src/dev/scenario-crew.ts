/**
 * The crews of the start scenarios. Each scenario has its own crew, found again by its name on a
 * reseed, started the way `create_crew` starts one (which mints its join code) and, for the
 * Vietnamese trip scenarios, settling in đồng whatever the caller's home is. The five crewmates of
 * a trip scenario are clearly fake people ("Demo" surnames, no sign-in), added to the crew and
 * seated on the trip as friends who joined after the plan was locked.
 */
import { encodeMemberColour, generateUuidV7, memberColourForSlot } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../admin/command';
import { startCrew } from '../commands/crews/create-crew';
import { codeExpiry, liveJoinCode, mintJoinCode } from '../commands/crews/shared';
import type { SeedCaller } from './play-command';

export const SCENARIO_CREW_NAMES = {
  trip_today: 'Đà Nẵng Today',
  trip_tomorrow: 'Đà Nẵng Tomorrow',
  draft_ready: 'Đà Nẵng Draft',
  crew_with_code: 'Code Crew',
} as const;

/** In join order; the first paid for the seeded ride. */
export const SCENARIO_CREWMATES = [
  'Linh Demo',
  'Minh Demo',
  'Trang Demo',
  'Khoa Demo',
  'Vy Demo',
] as const;

export interface ScenarioCrew {
  readonly crewId: string;
  /** The crew's first trip, when it has one. */
  readonly tripId: string | null;
  readonly created: boolean;
}

/** The caller's crew for a scenario: the one an earlier seed made, or a new one. */
export async function ensureScenarioCrew(
  tx: pg.PoolClient,
  who: SeedCaller,
  name: string,
  settlementCurrency: string | null,
): Promise<ScenarioCrew> {
  const { rows } = await tx.query<{ crew_id: string; trip_id: string | null }>(
    `SELECT c.id AS crew_id,
            (SELECT t.id FROM trips t WHERE t.crew_id = c.id ORDER BY t.created_at LIMIT 1) AS trip_id
       FROM crews c JOIN crew_members m ON m.crew_id = c.id AND m.user_id = $1 AND m.status = 'active'
      WHERE c.created_by = $1 AND c.name = $2
      ORDER BY c.created_at LIMIT 1`,
    [who.uid, name],
  );
  const found = rows[0];
  if (found !== undefined) return { crewId: found.crew_id, tripId: found.trip_id, created: false };
  const crewId = generateUuidV7();
  await startCrew(tx, { crewId, name, art: null, uid: who.uid, now: who.now });
  if (settlementCurrency !== null) {
    await asSystemRole(tx, () =>
      tx.query('UPDATE crews SET settlement_currency = $2 WHERE id = $1', [
        crewId,
        settlementCurrency,
      ]),
    );
  }
  return { crewId, tripId: null, created: true };
}

/** The crew's live join code; a crew whose code ran out gets a new one. */
export async function scenarioCrewCode(
  tx: pg.PoolClient,
  crewId: string,
  now: Date,
): Promise<string> {
  const live = await liveJoinCode(tx, 'crew', crewId, now);
  if (live !== null) return live.code;
  const minted = await mintJoinCode(tx, {
    kind: 'crew',
    ref: crewId,
    expiresAt: codeExpiry(now),
    rotate: true,
  });
  return minted.code;
}

/** Adds the five crewmates to the crew and seats them on the trip; returns their ids in order. */
export async function addScenarioCrewmates(
  tx: pg.PoolClient,
  crewId: string,
  tripId: string,
): Promise<string[]> {
  return asSystemRole(tx, async () => {
    const ids: string[] = [];
    for (const [index, name] of SCENARIO_CREWMATES.entries()) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO users (id, status, display_name, home_airport, home_country, home_currency,
           locale, tz)
         VALUES (uuidv7(), 'registered', $1, 'SGN', 'Vietnam', 'VND', 'vi', 'Asia/Ho_Chi_Minh')
         RETURNING id`,
        [name],
      );
      const id = rows[0]?.id;
      if (id === undefined) throw new Error('scenario seed: a crewmate was not stored');
      await tx.query(
        `INSERT INTO crew_members (crew_id, user_id, role, colour) VALUES ($1, $2, 'member', $3)`,
        [crewId, id, encodeMemberColour(memberColourForSlot(index + 1))],
      );
      await tx.query(
        `INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')`,
        [tripId, id],
      );
      ids.push(id);
    }
    return ids;
  });
}
