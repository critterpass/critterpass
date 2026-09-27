/**
 * A transient server failure mid-batch: the upload door answers 503 with `first_unprocessed`, the
 * client keeps the outcomes before it, backs off and resends only the rest, and every op still runs
 * exactly once. Replaying the whole batch by hand afterwards returns `duplicate` for every op.
 */
import { generateUuidV7 } from '@cp/domain';

import {
  CREATE_CREW,
  FLAKY_STEP,
  newDevice,
  openClient,
  postJson,
  refusedBaseUrl,
  signInAnonymously,
  type NodeSyncClient,
} from '../clients';
import {
  check,
  commandLogCount,
  crewCreatedHints,
  everyOnce,
  waitFor,
  type Scenario,
} from '../support';

export const transientRetry: Scenario = {
  name: 'transient-retry',
  description: 'api 503 mid-batch → the retry is idempotent',
  async run({ stack, log }) {
    const device = newDevice();
    const session = await signInAnonymously(stack);
    const crewIds = [generateUuidV7(), generateUuidV7(), generateUuidV7(), generateUuidV7()];
    const opened: NodeSyncClient[] = [];
    try {
      const offline = await openClient(stack, {
        device,
        session,
        offlineBaseUrl: await refusedBaseUrl(),
      });
      opened.push(offline);
      const [first, second, third, fourth] = crewIds;
      for (const crewId of [first, second]) {
        await offline.core.commands.send(CREATE_CREW, { crew_id: crewId, name: 'Early' });
      }
      await offline.core.commands.send(FLAKY_STEP, { key: generateUuidV7() });
      for (const crewId of [third, fourth]) {
        await offline.core.commands.send(CREATE_CREW, { crew_id: crewId, name: 'Late' });
      }
      const envelopes = (
        await offline.db.getAll<{ envelope: string }>('SELECT envelope FROM commands ORDER BY seq')
      ).map((row) => JSON.parse(row.envelope) as unknown);
      await offline.close();
      opened.pop();

      const online = await openClient(stack, { device, session });
      opened.push(online);
      const errors = new Set<string>();
      const unsubscribe = online.core.queue.subscribe((state) => {
        if (state.lastError !== null) errors.add(state.lastError);
      });
      await waitFor(
        async () =>
          (await online.db.get<{ n: number }>('SELECT count(*) AS n FROM commands')).n === 0,
        'the batch to settle after the retry',
      );
      unsubscribe();
      check(errors.has('INTERNAL'), `no transient 503 was seen (${[...errors].join(', ')})`);
      check(online.core.queue.getState().failures === 0, 'the queue still reports a failure');
      check((await commandLogCount(stack, session.uid)) === 5, 'not every op ran once');
      check(everyOnce(await crewCreatedHints(stack, crewIds)), 'an op ran twice across the retry');

      const replay = await postJson(stack, session, '/sync/upload', { ops: envelopes });
      const statuses = (replay.body as { results?: { status: string }[] }).results?.map(
        (result) => result.status,
      );
      check(
        replay.status === 200 && statuses?.length === 5 && statuses.every((s) => s === 'duplicate'),
        `replaying the batch did not return duplicates: ${replay.status} ${JSON.stringify(statuses)}`,
      );
      check((await commandLogCount(stack, session.uid)) === 5, 'the replay ran ops again');
      check(everyOnce(await crewCreatedHints(stack, crewIds)), 'the replay ran a handler again');
      log('503 at op 3 of 5; the resend applied ops 3-5 once; a full replay answered duplicate ×5');
    } finally {
      for (const client of opened) await client.close();
      device.remove();
    }
  },
};
