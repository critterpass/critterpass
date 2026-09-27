/**
 * Server-side realtime revocation (docs/system-architecture.md §4.3 "Revocation"): an
 * `unsubscribe` row per channel, or one `disconnect` row that drops every connection of the user.
 * Rows follow the same shape the membership triggers write (`payload.user_id`), so the relay maps
 * both identically.
 *
 * Only a system transaction (`withSystem`) may write these: `app.enqueue_rt` refuses control kinds
 * from a user transaction, because a member must never be able to kick someone else. User-initiated
 * membership changes get their revocations from the `crew_members`/`trip_participants` triggers in
 * the same transaction instead.
 */
import { userChannel } from '@cp/domain';
import type pg from 'pg';

import { enqueueRealtime } from '../events';

export type RevokeRealtimeInput =
  | { readonly uid: string; readonly channels: readonly string[] }
  | { readonly uid: string; readonly all: true };

export async function revokeRealtime(
  tx: pg.PoolClient,
  input: RevokeRealtimeInput,
): Promise<{ readonly ids: readonly string[] }> {
  if ('all' in input) {
    const row = await enqueueRealtime(tx, {
      channel: userChannel(input.uid),
      payload: { user_id: input.uid },
      kind: 'disconnect',
    });
    return { ids: [row.id] };
  }
  const ids: string[] = [];
  for (const channel of input.channels) {
    const row = await enqueueRealtime(tx, {
      channel,
      payload: { user_id: input.uid },
      kind: 'unsubscribe',
    });
    ids.push(row.id);
  }
  return { ids };
}
