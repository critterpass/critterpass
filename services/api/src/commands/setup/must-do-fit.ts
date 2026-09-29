/**
 * Queues the must-do fit check for a trip (`ai.fit_check`, one queued per trip): after a must-do
 * lands, the dates move, or a step re-opens, the worker re-checks every must-do and writes the
 * guide's one-line note.
 */
import { sendInTx } from '@cp/db';
import { SETUP_QUEUES } from '@cp/domain';
import type pg from 'pg';

export function queueFitChecks(tx: pg.PoolClient, tripId: string): Promise<string | null> {
  return sendInTx(tx, SETUP_QUEUES.fitCheck, { trip_id: tripId }, { singletonKey: tripId });
}
