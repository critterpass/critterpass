/**
 * The recap's api mount: its commands (views and signatures, the MVP vote, opting out of an award,
 * retrying a failed build), the live channels `recap:{id}` and `memory:{id}` for the travellers
 * who may read them, and the hook that queues a recap build for the events this process appends (a
 * trip ended here, or a late expense, booking, ride or payment on a trip that already ended), the
 * same hook the worker registers for its own events.
 */
import { onEventAppended, sendInTx } from '@cp/db';
import {
  isRecapBuildEvent,
  RECAP_TRIP_STATE_SQL,
  recapBuildForEvent,
  type RecapTripState,
} from '@cp/domain';
import type pg from 'pg';

import { aclForSql, getNamespace, registerNamespace } from '../../realtime/namespaces';
import type { CommandRegistry } from '../_framework/registry';
import { castMvpVoteCommand } from './cast-mvp-vote';
import { optOutAwardCommand } from './opt-out-award';
import { recordRecapViewCommand } from './record-recap-view';
import { retryRecapCommand } from './retry-recap';
import { saveSignatureCommand } from './save-signature';

export async function recapEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  if (event.tripId === null || !isRecapBuildEvent(event.type)) return;
  const { rows } = await tx.query<RecapTripState>(RECAP_TRIP_STATE_SQL, [event.tripId]);
  const request = recapBuildForEvent(event, rows[0] ?? null);
  if (request === null) return;
  await sendInTx(tx, request.queue, request.data, request.options);
}

export function registerRecapCommands(registry: CommandRegistry): void {
  registry.register(recordRecapViewCommand);
  registry.register(saveSignatureCommand);
  registry.register(castMvpVoteCommand);
  registry.register(optOutAwardCommand);
  registry.register(retryRecapCommand);
}

/** Row security decides: a recap or memory the caller can read is a channel they may join. */
function registerRecapChannels(): void {
  if (getNamespace('recap') === undefined) {
    registerNamespace({
      name: 'recap',
      acl: aclForSql('SELECT EXISTS (SELECT 1 FROM recaps WHERE id = $1::uuid) AS allowed'),
      presence: false,
    });
  }
  if (getNamespace('memory') === undefined) {
    registerNamespace({
      name: 'memory',
      acl: aclForSql('SELECT EXISTS (SELECT 1 FROM memories WHERE id = $1::uuid) AS allowed'),
      presence: false,
    });
  }
}

export function registerRecap(doors: { readonly registry: CommandRegistry }): void {
  registerRecapCommands(doors.registry);
  registerRecapChannels();
  onEventAppended(recapEventHook);
}
