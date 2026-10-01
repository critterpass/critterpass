/**
 * The one way a proposal locks the crew in, shared by the organiser's `lock_proposal` and the
 * reply-by job: the proposal becomes `locked` (once, with its event), the plan version the crew
 * was sent becomes the trip's `current` plan, and the trip moves `proposed → confirmed` through
 * the trip-status path. Who is on the trip is the caller's business (the organiser's lock moves
 * people off; the job at reply-by moves nobody). Runs in the caller's transaction, as a role that
 * may update `proposals`, `itinerary_versions` and `trips`.
 */
import type pg from 'pg';

import { appendDomainEvent } from '../events';
import { confirmTrip, type TripStatusActor } from '../trips/status';

export interface LockProposalInput {
  readonly proposalId: string;
  readonly tripId: string;
  readonly crewId: string;
  readonly actor: TripStatusActor;
  readonly now: Date;
  /** Recipients who never answered, for the `proposal.locked` event. */
  readonly unanswered: number;
}

const CONFIRMED_OR_LATER: ReadonlySet<string> = new Set([
  'confirmed',
  'pre_trip',
  'in_trip',
  'post_trip',
]);

/** Whether the trip is confirmed (or already further along). */
export function isConfirmedOrLater(status: string): boolean {
  return CONFIRMED_OR_LATER.has(status);
}

/** Locks the proposal if it is still out (`sent`); resolves to whether this call locked it. */
export async function markProposalLocked(
  tx: pg.PoolClient,
  input: LockProposalInput,
): Promise<boolean> {
  const locked = await tx.query(
    `UPDATE proposals SET status = 'locked', locked_at = $2 WHERE id = $1 AND status = $3`,
    [input.proposalId, input.now, 'sent'],
  );
  if ((locked.rowCount ?? 0) === 0) return false;
  await appendDomainEvent(tx, {
    type: 'proposal.locked',
    aggregateKind: 'proposal',
    aggregateId: input.proposalId,
    actorKind: input.actor.kind,
    actorId: input.actor.kind === 'user' ? input.actor.id : null,
    payload: {
      trip_id: input.tripId,
      proposal_id: input.proposalId,
      unanswered: input.unanswered,
    },
    crewId: input.crewId,
    tripId: input.tripId,
  });
  return true;
}

/**
 * Locks the proposal and confirms the trip on the plan the crew was sent. Resolves to the trip's
 * status afterwards: `confirmed` when this call (or an earlier one) confirmed it, otherwise the
 * status that kept it from moving. Safe to repeat.
 */
export async function lockProposalAndConfirm(
  tx: pg.PoolClient,
  input: LockProposalInput,
): Promise<string> {
  await markProposalLocked(tx, input);
  const moved = await confirmTrip(tx, input.tripId, input.actor);
  const { rows } = await tx.query<{ status: string }>('SELECT status FROM trips WHERE id = $1', [
    input.tripId,
  ]);
  const status = rows[0]?.status ?? 'unknown';
  if (moved || CONFIRMED_OR_LATER.has(status)) {
    await tx.query(
      `UPDATE itinerary_versions SET status = 'current'
        WHERE status = 'proposed' AND id = (SELECT current_version_id FROM trips WHERE id = $1)`,
      [input.tripId],
    );
  }
  return status;
}
