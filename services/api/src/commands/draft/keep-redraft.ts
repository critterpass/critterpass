/**
 * `keep_redraft` and `revert_redraft` (docs/api-contracts.md §4.6; `redraft_id` is the redraft's
 * agent job). Keeping adopts the redrafted day as the new private draft (with any changes the
 * organiser toggled off put back as they were) and counts it against the trip's redrafts; putting it
 * back drops it and gives the redraft back (it still counted against the silent daily cap when it
 * was asked for). Nobody else has seen either version, and nothing was held or booked, so nothing
 * else needs undoing.
 */
import { emitEvent } from '@cp/db';
import {
  DomainError,
  keepRedraftPayloadSchema,
  redraftResultSchema,
  revertRedraftPayloadSchema,
  type RedraftResult,
} from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { defineCommand } from '../_framework/define-command';
import { loadSetupTrip, publishRedraftCounter, requireOrganiser } from './shared';
import { copyVersion, refreshNumbers, restoreItems } from './versions';

interface Redraft {
  readonly id: string;
  readonly tripId: string;
  readonly status: string;
  readonly result: RedraftResult | null;
  readonly reservation: string | null;
}

async function loadRedraft(tx: pg.PoolClient, redraftId: string): Promise<Redraft> {
  const { rows } = await tx.query<{
    id: string;
    trip_id: string;
    status: string;
    result_ref: unknown;
    reservation: string | null;
  }>(
    `SELECT j.id, j.trip_id, j.status, j.result_ref, r.status AS reservation
       FROM agent_jobs j LEFT JOIN redraft_reservations r ON r.agent_job_id = j.id
      WHERE j.id = $1 AND j.kind = 'redraft'`,
    [redraftId],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { redraft_id: redraftId });
  const parsed = redraftResultSchema.safeParse(row.result_ref);
  return {
    id: row.id,
    tripId: row.trip_id,
    status: row.status,
    result: parsed.success ? parsed.data : null,
    reservation: row.reservation,
  };
}

/** A delivered, still-open redraft of a trip in review of it; anything else is refused. */
async function openRedraft(tx: pg.PoolClient, redraftId: string) {
  const redraft = await asSystemRole(tx, () => loadRedraft(tx, redraftId));
  await requireOrganiser(tx, redraft.tripId);
  const trip = await asSystemRole(tx, () => loadSetupTrip(tx, redraft.tripId, true));
  if (
    redraft.status !== 'succeeded' ||
    redraft.reservation !== 'reserved' ||
    trip.status !== 'redrafting'
  ) {
    throw new DomainError('STATE_INVALID', { reason: 'redraft_not_open', state: redraft.status });
  }
  const result = redraft.result;
  if (result === null || result.outcome !== 'changed' || result.candidate_version_id === null) {
    throw new DomainError('STATE_INVALID', { reason: 'nothing_to_keep' });
  }
  return { redraft, trip, result, candidate: result.candidate_version_id };
}

async function settle(tx: pg.PoolClient, redraftId: string, tripId: string): Promise<void> {
  await tx.query(
    "UPDATE redraft_reservations SET status = 'committed', settled_at = now() WHERE agent_job_id = $1",
    [redraftId],
  );
  await tx.query("UPDATE trips SET status = 'draft_review' WHERE id = $1", [tripId]);
}

/** A redraft put back: its reservation is released and the trip's visible unit comes back. */
async function giveBack(tx: pg.PoolClient, redraftId: string, tripId: string): Promise<void> {
  const { rows } = await tx.query<{ quota_period_key: string | null }>(
    `UPDATE redraft_reservations SET status = 'released', settled_at = now()
      WHERE agent_job_id = $1 AND status = 'reserved' RETURNING quota_period_key`,
    [redraftId],
  );
  const key = rows[0]?.quota_period_key ?? null;
  if (key !== null) {
    await tx.query("SELECT app.release_quota('trip', $1, 'redrafts', $2)", [tripId, key]);
  }
  await tx.query("UPDATE trips SET status = 'draft_review' WHERE id = $1", [tripId]);
}

export const keepRedraftCommand = defineCommand({
  name: 'keep_redraft',
  v: 1,
  schema: keepRedraftPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const redraft = await asSystemRole(tx, () => loadRedraft(tx, payload.redraft_id));
    await requireOrganiser(tx, redraft.tripId);
  },
  handle: async (tx, payload, ctx) => {
    const { redraft, trip, result, candidate } = await openRedraft(tx, payload.redraft_id);
    return asSystemRole(tx, async () => {
      const { rows } = await tx.query<{ draft_version_id: string | null; members: number }>(
        `SELECT draft_version_id,
                (SELECT count(*)::int FROM trip_participants
                  WHERE trip_id = $1 AND rsvp NOT IN ('out', 'waitlisted')) AS members
           FROM trips WHERE id = $1`,
        [trip.id],
      );
      const current = rows[0]?.draft_version_id ?? null;
      if (current !== result.base_version_id) {
        throw new DomainError('VERSION_CONFLICT', { current_version: current });
      }
      const excluded = (payload.excluded_stable_ids ?? []).filter((id) =>
        result.changes.some((change) => change.stable_id === id),
      );
      let kept = candidate;
      if (excluded.length > 0) {
        kept = await copyVersion(tx, candidate, result.base_version_id, excluded);
        await restoreItems(tx, kept, result.base_version_id, excluded);
        await refreshNumbers(tx, kept, Math.max(1, rows[0]?.members ?? 1));
        await tx.query("UPDATE itinerary_versions SET status = 'superseded' WHERE id = $1", [
          candidate,
        ]);
      } else {
        await tx.query(
          "UPDATE itinerary_versions SET status = 'draft', origin = 'guide' WHERE id = $1",
          [candidate],
        );
      }
      await tx.query("UPDATE itinerary_versions SET status = 'superseded' WHERE id = $1", [
        result.base_version_id,
      ]);
      await tx.query('UPDATE trips SET draft_version_id = $2 WHERE id = $1', [trip.id, kept]);
      await settle(tx, redraft.id, trip.id);
      await emitEvent(tx, {
        type: 'redraft.kept',
        aggregateKind: 'trip',
        aggregateId: trip.id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: trip.crew_id,
        tripId: trip.id,
        payload: { trip_id: trip.id, redraft_id: redraft.id, version_id: kept },
      });
      await publishRedraftCounter(tx, trip.id);
      return { trip_id: trip.id, version_id: kept, day_no: result.day_no, title: result.title };
    });
  },
});

export const revertRedraftCommand = defineCommand({
  name: 'revert_redraft',
  v: 1,
  schema: revertRedraftPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    const redraft = await asSystemRole(tx, () => loadRedraft(tx, payload.redraft_id));
    await requireOrganiser(tx, redraft.tripId);
  },
  handle: async (tx, payload, ctx) => {
    const { redraft, trip, candidate } = await openRedraft(tx, payload.redraft_id);
    return asSystemRole(tx, async () => {
      await tx.query("UPDATE itinerary_versions SET status = 'superseded' WHERE id = $1", [
        candidate,
      ]);
      await giveBack(tx, redraft.id, trip.id);
      await emitEvent(tx, {
        type: 'redraft.reverted',
        aggregateKind: 'trip',
        aggregateId: trip.id,
        actorKind: 'user',
        actorId: ctx.uid,
        crewId: trip.crew_id,
        tripId: trip.id,
        payload: { trip_id: trip.id, redraft_id: redraft.id },
      });
      await publishRedraftCounter(tx, trip.id);
      return { trip_id: trip.id, version_id: null };
    });
  },
});
