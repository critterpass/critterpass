import { withSystem } from '@cp/db';
import type pg from 'pg';

import { writeFailedCandidate } from './candidates';

/**
 * A job that names a candidate but cannot be read as an import (text past the parser's limit, an
 * unknown kind) still ends it: the candidate fails as unreadable instead of staying `parsing`.
 */
export async function failUnreadableImport(
  pool: pg.Pool,
  candidateId: string,
): Promise<'failed' | 'gone'> {
  return withSystem(pool, async (tx) => {
    const { rows } = await tx.query<{
      user_id: string;
      crew_id: string | null;
      trip_id: string | null;
      source: 'paste' | 'scan';
    }>(
      `SELECT user_id, crew_id, trip_id, source FROM import_candidates
        WHERE id = $1 AND status = 'parsing' AND source IN ('paste', 'scan')`,
      [candidateId],
    );
    const row = rows[0];
    if (row === undefined) return 'gone';
    await writeFailedCandidate(
      tx,
      {
        userId: row.user_id,
        crewId: row.crew_id,
        tripId: row.trip_id,
        source: row.source,
        scope: { kind: 'user', id: row.user_id },
        crewVisible: false,
        candidateId,
      },
      'unreadable',
    );
    return 'failed';
  });
}
