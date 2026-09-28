/**
 * Leaving a crew, by choice or by removal: organiser roles the member held alone pass to the
 * longest-standing remaining member, the member leaves every live trip of the crew (their seat or
 * waitlist place goes to `out`; the waitlist sweep offers freed seats), and their membership row
 * turns inactive. The membership trigger bumps the crew's epoch and queues the realtime
 * unsubscribes for the crew and its trips in this same transaction; PowerSync drops the crew's
 * rows from the member's streams once that row replicates.
 */
import { appendDomainEvent, outbox } from '@cp/db';
import { crewChannel, type MembershipChangeResult } from '@cp/domain';
import type pg from 'pg';

export interface DepartureInput {
  readonly crewId: string;
  readonly memberId: string;
  readonly actorId: string;
  readonly status: 'left' | 'former' | 'removed';
  readonly keepInChat: boolean;
}

export async function departCrew(
  tx: pg.PoolClient,
  input: DepartureInput,
): Promise<MembershipChangeResult> {
  const handed = await tx.query<{ scope: 'trip' | 'crew'; scope_id: string }>(
    'SELECT scope, scope_id FROM app.hand_off_organiser($1, $2)',
    [input.crewId, input.memberId],
  );
  const released = await tx.query<{ trip_id: string; freed_seat: boolean }>(
    'SELECT trip_id, freed_seat FROM app.release_member_trips($1, $2)',
    [input.crewId, input.memberId],
  );

  // Activity rows and crew hints are written while a leaver can still see the crew.
  for (const row of released.rows) {
    await appendDomainEvent(tx, {
      type: 'rsvp.changed',
      aggregateKind: 'trip',
      aggregateId: row.trip_id,
      actorKind: 'user',
      actorId: input.actorId,
      payload: { trip_id: row.trip_id, user_id: input.memberId, rsvp: 'out' },
      crewId: input.crewId,
      tripId: row.trip_id,
    });
  }

  const removed = input.status === 'removed';
  await appendDomainEvent(tx, {
    type: removed ? 'crew.member_removed' : 'crew.member_left',
    aggregateKind: 'crew',
    aggregateId: input.crewId,
    actorKind: 'user',
    actorId: input.actorId,
    payload: { crew_id: input.crewId, user_id: input.memberId },
    crewId: input.crewId,
  });
  await outbox(tx, crewChannel(input.crewId), removed ? 'member.removed' : 'member.left', {
    crew_id: input.crewId,
    user_id: input.memberId,
  });

  await tx.query(
    `UPDATE crew_members SET status = $3, keep_in_chat = $4, left_at = now()
      WHERE crew_id = $1 AND user_id = $2 AND status = 'active'`,
    [input.crewId, input.memberId, input.status, input.keepInChat],
  );

  return {
    crew_id: input.crewId,
    handed_off: handed.rows.map((row) => ({ scope: row.scope, id: row.scope_id })),
    freed_trips: released.rows.filter((row) => row.freed_seat).map((row) => row.trip_id),
  };
}
