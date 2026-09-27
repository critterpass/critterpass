/**
 * A standard crew fixture shared by the identity/crew permission tests: an organiser, a member and
 * an outsider who belongs to neither. Built via `withSystem` so it bypasses the same app_user row
 * scoping the tests exercise.
 */
import type pg from 'pg';

import { withSystem } from '../../src/tx';
import { insertCrew, insertCrewMember, insertUser } from './actors';

export interface CrewFixture {
  readonly crewId: string;
  readonly organiserId: string;
  readonly memberId: string;
  readonly outsiderId: string;
}

export async function buildCrewFixture(pool: pg.Pool): Promise<CrewFixture> {
  return withSystem(pool, async (tx) => {
    const organiserId = await insertUser(tx);
    const memberId = await insertUser(tx);
    const outsiderId = await insertUser(tx);
    const crewId = await insertCrew(tx, { createdBy: organiserId });
    await insertCrewMember(tx, { crewId, userId: organiserId, role: 'organiser' });
    await insertCrewMember(tx, { crewId, userId: memberId, role: 'member' });
    return { crewId, organiserId, memberId, outsiderId };
  });
}
