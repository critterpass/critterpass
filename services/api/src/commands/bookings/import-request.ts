/**
 * What `import_paste` and `import_scan` share: the candidate appears at once as `parsing` under
 * the client's id (its owner's only, synced on `me`), and `import.parse` reads it off the command
 * path. A trip, when named, must be one the caller takes part in; the candidate then belongs to
 * that trip's crew for dedupe against its wallet.
 */
import { emitEvent, sendInTx } from '@cp/db';
import { BOOKINGS_QUEUES, DomainError, pendingDedupeKey, type ImportParseJob } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { requireTripParticipant } from './shared';

export async function requestImport(
  tx: pg.PoolClient,
  input: {
    readonly uid: string;
    readonly candidateId: string;
    readonly tripId: string | undefined;
    readonly job: ImportParseJob;
  },
): Promise<{ candidate_id: string }> {
  const trip =
    input.tripId === undefined ? null : await requireTripParticipant(tx, input.tripId, input.uid);
  await asSystemRole(tx, async () => {
    const existing = await tx.query('SELECT 1 FROM import_candidates WHERE id = $1', [
      input.candidateId,
    ]);
    if ((existing.rowCount ?? 0) > 0) {
      throw new DomainError('STATE_INVALID', { reason: 'candidate_exists' });
    }
    await tx.query(
      `INSERT INTO import_candidates (id, user_id, crew_id, trip_id, source, dedupe_key, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'parsing')`,
      [
        input.candidateId,
        input.uid,
        trip?.crew_id ?? null,
        trip?.id ?? null,
        input.job.kind,
        pendingDedupeKey(input.candidateId),
      ],
    );
  });
  await sendInTx(tx, BOOKINGS_QUEUES.importParse, input.job, { singletonKey: input.candidateId });
  await emitEvent(tx, {
    type: 'import.requested',
    aggregateKind: 'import_candidate',
    aggregateId: input.candidateId,
    actorKind: 'user',
    actorId: input.uid,
    crewId: trip?.crew_id ?? null,
    tripId: trip?.id ?? null,
    payload: {
      candidate_id: input.candidateId,
      user_id: input.uid,
      trip_id: trip?.id ?? null,
      source: input.job.kind,
    },
  });
  return { candidate_id: input.candidateId };
}
