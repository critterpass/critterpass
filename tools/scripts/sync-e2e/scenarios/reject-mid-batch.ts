/**
 * A business reject in the middle of an upload batch: the rejected op is reported per op (its
 * `cmd_results` row, then the local "didn't go through" list with its code) while every op after
 * it in the same batch still applies, with no retry.
 */
import { generateUuidV7 } from '@cp/domain';

import {
  CREATE_CREW,
  newDevice,
  openClient,
  refusedBaseUrl,
  RENAME_CREW,
  signInAnonymously,
  type NodeSyncClient,
} from '../clients';
import { check, commandLogCount, crewCreatedHints, everyOnce, scalar, waitFor } from '../support';
import type { Scenario } from '../support';

export const rejectMidBatch: Scenario = {
  name: 'reject-mid-batch',
  description: 'a rejected op mid-batch is reported and the rest of the batch still applies',
  async run({ stack, log }) {
    const device = newDevice();
    const session = await signInAnonymously(stack);
    const before = [generateUuidV7(), generateUuidV7()];
    const after = [generateUuidV7(), generateUuidV7()];
    const opened: NodeSyncClient[] = [];
    try {
      // Queued offline so all five ops go up together in one batch after the restart.
      const offline = await openClient(stack, {
        device,
        session,
        offlineBaseUrl: await refusedBaseUrl(),
      });
      opened.push(offline);
      for (const crewId of before) {
        await offline.core.commands.send(CREATE_CREW, { crew_id: crewId, name: 'Before' });
      }
      // Not a member of this crew: the handler's authorize step rejects it.
      const rejected = await offline.core.commands.send(RENAME_CREW, {
        crew_id: generateUuidV7(),
        name: 'Not mine',
      });
      for (const crewId of after) {
        await offline.core.commands.send(CREATE_CREW, { crew_id: crewId, name: 'After' });
      }
      await offline.close();
      opened.pop();

      const online = await openClient(stack, { device, session });
      opened.push(online);
      const errors: string[] = [];
      const unsubscribe = online.core.queue.subscribe((state) => {
        if (state.lastError !== null) errors.push(state.lastError);
      });
      await waitFor(
        async () =>
          (await online.db.get<{ n: number }>('SELECT count(*) AS n FROM commands')).n === 0,
        'the batch to settle',
      );
      unsubscribe();

      const listed = await online.db.getAll<{ id: string; code: string; cmd: string }>(
        'SELECT id, code, cmd FROM rejected_commands',
      );
      check(
        listed.length === 1 && listed[0]?.id === rejected.opId && listed[0].code === 'FORBIDDEN',
        `expected only the rename in the rejected list, got ${JSON.stringify(listed)}`,
      );
      check(errors.length === 0, `the reject caused a retry (${errors.join(', ')})`);
      await waitFor(
        async () => (await online.db.get<{ n: number }>('SELECT count(*) AS n FROM crews')).n === 4,
        'the four created crews to sync down',
      );
      check((await commandLogCount(stack, session.uid)) === 5, 'not every op reached the server');
      const rejectedOnServer = await scalar(
        stack,
        `SELECT count(*) AS n FROM cmd_results WHERE uid = $1 AND status = 'rejected'`,
        [session.uid],
      );
      check(rejectedOnServer === 1, `expected 1 rejected result, got ${rejectedOnServer}`);
      check(
        everyOnce(await crewCreatedHints(stack, [...before, ...after])),
        'ops around the reject did not each apply once',
      );
      log('1 op rejected with FORBIDDEN, the 4 around it applied in the same batch');
    } finally {
      for (const client of opened) await client.close();
      device.remove();
    }
  },
};
