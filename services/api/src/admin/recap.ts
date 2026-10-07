/**
 * Recap rebuild: `rebuild_recap {recap_id | trip_id, mode, reason}` queues a recap that is already
 * built for another run, after the recap logic or the guide's voice changed. `full` queues
 * `recap.build` (which words and narrates a version whose numbers changed); `narration` queues
 * `recap.narrate` alone (which records every card whose words, voice or speech model changed).
 *
 * Both go out on the keys the normal path uses, so a rebuild asked for twice, or while a late
 * expense has one waiting, folds into one run. The recap row is not touched here: it stays `ready`
 * and readable while the worker runs, and the worker updates it in place (same recap id, same
 * award ids), so its share links, the signatures on its stamps and the crew's MVP votes stand.
 */
import { sendInTx } from '@cp/db';
import { DomainError, recapBuildSingletonKey, RECAP_QUEUES, type RecapBuildJob } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { defineAdminArea, defineAdminCommand } from './registry';

export const RECAP_REBUILD_MODES = ['full', 'narration'] as const;

export const rebuildRecapPayloadSchema = z
  .object({
    recap_id: z.uuid().optional(),
    trip_id: z.uuid().optional(),
    mode: z.enum(RECAP_REBUILD_MODES),
    reason: z.string().trim().min(3).max(200),
  })
  .strict()
  .refine((payload) => (payload.recap_id === undefined) !== (payload.trip_id === undefined), {
    message: 'give exactly one of recap_id and trip_id',
    path: ['recap_id'],
  });
export type RebuildRecapPayload = z.infer<typeof rebuildRecapPayloadSchema>;

export interface RebuildRecapResult {
  readonly recap_id: string;
  readonly trip_id: string;
  readonly mode: (typeof RECAP_REBUILD_MODES)[number];
  /** False when a run for this recap was already waiting, so this request folded into it. */
  readonly queued: boolean;
}

/** Queues the run for a recap that is `ready`; one that never got there is the app's retry. */
export async function rebuildRecap(
  tx: pg.PoolClient,
  payload: RebuildRecapPayload,
): Promise<RebuildRecapResult> {
  const byRecap = payload.recap_id !== undefined;
  const { rows } = await tx.query<{ id: string; trip_id: string; built: boolean }>(
    `SELECT id, trip_id, (status = 'ready' AND version > 0 AND copy_version > 0) AS built
       FROM recaps WHERE ${byRecap ? 'id' : 'trip_id'} = $1`,
    [byRecap ? payload.recap_id : payload.trip_id],
  );
  const recap = rows[0];
  if (recap === undefined) throw new DomainError('NOT_FOUND', { reason: 'recap' });
  if (!recap.built) throw new DomainError('STATE_INVALID', { reason: 'recap_not_ready' });
  let jobId: string | null;
  if (payload.mode === 'full') {
    const job: RecapBuildJob = { trip_id: recap.trip_id, reason: 'retry' };
    jobId = await sendInTx(tx, RECAP_QUEUES.build, job, {
      singletonKey: recapBuildSingletonKey(recap.trip_id),
    });
  } else {
    jobId = await sendInTx(
      tx,
      RECAP_QUEUES.narrate,
      { recap_id: recap.id },
      { singletonKey: recap.id },
    );
  }
  return { recap_id: recap.id, trip_id: recap.trip_id, mode: payload.mode, queued: jobId !== null };
}

export function recapArea() {
  return defineAdminArea({
    id: 'recap',
    reads: [],
    commands: [
      defineAdminCommand({
        name: 'rebuild_recap',
        schema: rebuildRecapPayloadSchema,
        audit: (payload, result: RebuildRecapResult) => ({
          targetKind: 'recap',
          targetId: result.recap_id,
          reason: payload.reason,
          detail: { trip_id: result.trip_id, mode: result.mode, queued: result.queued },
          summary: `Recap ${result.recap_id} · ${result.mode} rebuild ${result.queued ? 'queued' : 'already waiting'}`,
          changes: [],
        }),
        handle: (tx, payload) => rebuildRecap(tx, payload),
      }),
    ],
  });
}
