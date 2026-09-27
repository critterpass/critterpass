/**
 * Offline queue → restart → replay exactly once: 50 commands queued with no connectivity survive
 * the app being killed, upload in order on the next (online) launch, each runs exactly once on the
 * server, and their synced results clear the local queue.
 */
import { generateUuidV7 } from '@cp/domain';

import {
  CREATE_CREW,
  newDevice,
  openClient,
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

const OPS = 50;

async function localCount(client: NodeSyncClient, sql: string, params: unknown[] = []) {
  const row = await client.db.get<{ n: number }>(sql, params);
  return row.n;
}

export const offlineReplay: Scenario = {
  name: 'offline-replay',
  description: `offline queue of ${OPS} ops → restart → replayed exactly once`,
  async run({ stack, log }) {
    const device = newDevice();
    const session = await signInAnonymously(stack);
    const crewIds = Array.from({ length: OPS }, () => generateUuidV7());
    const opened: NodeSyncClient[] = [];
    try {
      const offline = await openClient(stack, {
        device,
        session,
        offlineBaseUrl: await refusedBaseUrl(),
      });
      opened.push(offline);
      for (const [index, crewId] of crewIds.entries()) {
        const sent = await offline.core.commands.send(CREATE_CREW, {
          crew_id: crewId,
          name: `Offline crew ${index + 1}`,
        });
        check(sent.kind === 'queued', `op ${index} was not queued (${sent.kind})`);
      }
      await offline.core.queue.flush();
      const offlineState = offline.core.queue.getState();
      check(offlineState.failures > 0, 'an upload without connectivity did not fail');
      check(
        (await localCount(offline, 'SELECT count(*) AS n FROM commands')) === OPS,
        'the offline queue does not hold every op',
      );
      log(`queued ${OPS} ops offline; upload failed with ${offlineState.lastError ?? '?'}`);

      // The app is killed while offline; nothing reached the server.
      await offline.close();
      opened.pop();
      check((await commandLogCount(stack, session.uid)) === 0, 'an offline op reached the server');

      const online = await openClient(stack, { device, session });
      opened.push(online);
      await waitFor(
        async () => (await localCount(online, 'SELECT count(*) AS n FROM commands')) === 0,
        'the replayed queue to settle through synced results',
        60_000,
      );
      await waitFor(
        async () => (await localCount(online, 'SELECT count(*) AS n FROM crews')) === OPS,
        'every created crew to sync down',
      );
      const results = await localCount(online, 'SELECT count(*) AS n FROM cmd_results');
      check(results === OPS, `expected ${OPS} synced results, got ${results}`);
      check(
        (await localCount(online, 'SELECT count(*) AS n FROM rejected_commands')) === 0,
        'a replayed op was rejected',
      );
      check((await commandLogCount(stack, session.uid)) === OPS, 'server ran a different op count');
      check(everyOnce(await crewCreatedHints(stack, crewIds)), 'a handler ran more than once');
      // UUIDv7 op ids sort in the order the ops were queued; each ran in its own transaction.
      const applied = await stack.pool.query<{ op_id: string; name: string }>(
        `SELECT l.op_id, c.name FROM cmd_log l JOIN crews c ON c.id = (l.result->>'crew_id')::uuid
          WHERE l.uid = $1 ORDER BY l.created_at, l.op_id`,
        [session.uid],
      );
      const appliedIds = applied.rows.map((row) => row.op_id);
      check(
        appliedIds.join() === [...appliedIds].sort().join() &&
          applied.rows.every((row, index) => row.name === `Offline crew ${index + 1}`),
        'ops were not applied in the order they were queued',
      );

      // Another cold start: nothing is left to send and nothing runs again.
      await online.close();
      opened.pop();
      const again = await openClient(stack, { device, session });
      opened.push(again);
      await again.core.queue.flush();
      check((await commandLogCount(stack, session.uid)) === OPS, 'a second restart re-sent ops');
      log(`replayed ${OPS} ops once each after restart; queue empty after a second restart`);
    } finally {
      for (const client of opened) await client.close();
      device.remove();
    }
  },
};
