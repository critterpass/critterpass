/**
 * When someone joins or leaves a crew, is removed, or answers "out", the trips their crew is setting up
 * recount at once: availability counts and window options, and the budget with its minimum-k
 * check (a band from four maxes must not survive a member leaving it with three). Runs in the
 * transaction that appends the event.
 */
import { sendInTx } from '@cp/db';
import { SETUP_QUEUES } from '@cp/domain';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';

const MEMBERSHIP_EVENTS = new Set([
  'crew.member_joined',
  'crew.member_left',
  'crew.member_removed',
  'rsvp.changed',
]);

export async function queueSetupRecomputes(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string },
): Promise<void> {
  if (!MEMBERSHIP_EVENTS.has(event.type)) return;
  const rows = await asSystemRole(tx, async () => {
    const found = await tx.query<{ trip_id: string }>(
      `SELECT t.id AS trip_id
         FROM app.domain_event_for_routing($1) e
         JOIN trips t ON t.status IN ('won', 'setup')
          AND (t.id = e.trip_id OR t.crew_id = e.crew_id
               OR t.id = (e.payload->>'trip_id')::uuid OR t.crew_id = (e.payload->>'crew_id')::uuid)
        WHERE e.type <> 'rsvp.changed' OR e.payload->>'rsvp' = 'out'`,
      [event.id],
    );
    return found.rows;
  });
  for (const { trip_id: tripId } of rows) {
    await sendInTx(
      tx,
      SETUP_QUEUES.budgetRecompute,
      { trip_id: tripId, force: true },
      {
        singletonKey: tripId,
      },
    );
    await sendInTx(tx, SETUP_QUEUES.windowRecompute, { trip_id: tripId }, { singletonKey: tripId });
  }
}
