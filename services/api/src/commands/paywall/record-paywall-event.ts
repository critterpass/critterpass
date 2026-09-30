/**
 * `record_paywall_event {entry_point, trip_id?, kind: shown|dismissed|quiet_no}` (offline): the app
 * records every paywall moment so the governor (on the device, from the synced rows, and on the
 * server before a paywall push) knows today's count and each trip's quiet noes. The client's own
 * id makes a queued replay land once.
 */
import { emitEvent } from '@cp/db';
import { DomainError, PAYWALL_ENTRIES, recordPaywallEventPayloadSchema } from '@cp/domain';

import { asServer } from '../../billing/as-server';
import { defineCommand } from '../_framework/define-command';

export const recordPaywallEventCommand = defineCommand({
  name: 'record_paywall_event',
  v: 1,
  schema: recordPaywallEventPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    if (payload.trip_id === null) return;
    const { rows } = await tx.query<{ member: boolean }>(
      'SELECT app.is_trip_member($1) AS member',
      [payload.trip_id],
    );
    if (rows[0]?.member !== true) throw new DomainError('NOT_FOUND', { reason: 'trip' });
  },
  handle: (tx, payload, ctx) =>
    asServer(tx, async () => {
      const { rowCount } = await tx.query(
        `INSERT INTO paywall_impressions (id, user_id, trip_id, entry_point, outcome, channel,
           governed, shown_at, local_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING`,
        [
          payload.id,
          ctx.uid,
          payload.trip_id,
          payload.entry_point,
          payload.kind,
          payload.channel,
          PAYWALL_ENTRIES[payload.entry_point].governed,
          ctx.clock.effectiveClientTs,
          payload.local_date,
        ],
      );
      if ((rowCount ?? 0) > 0) {
        await emitEvent(tx, {
          type: 'paywall.event',
          aggregateKind: 'paywall_impression',
          aggregateId: payload.id,
          actorKind: 'user',
          actorId: ctx.uid,
          tripId: payload.trip_id,
          payload: {
            user_id: ctx.uid,
            trip_id: payload.trip_id,
            entry_point: payload.entry_point,
            outcome: payload.kind,
          },
        });
      }
      return { id: payload.id };
    }),
});
