/**
 * Account switch on one device: when the next signed-in uid differs, the previous uid's synced
 * rows, queued commands, results and private values are wiped before anything syncs for the new
 * uid, and the new uid only ever sees its own data.
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
import { check, sleep, waitFor, type Scenario } from '../support';

async function count(client: NodeSyncClient, table: string): Promise<number> {
  return (await client.db.get<{ n: number }>(`SELECT count(*) AS n FROM ${table}`)).n;
}

export const accountSwitch: Scenario = {
  name: 'account-switch',
  description: 'uid switch clears the local DB before the next uid syncs',
  async run({ stack, log }) {
    const device = newDevice();
    const first = await signInAnonymously(stack);
    const second = await signInAnonymously(stack);
    const firstCrew = generateUuidV7();
    const secondCrew = generateUuidV7();
    const opened: NodeSyncClient[] = [];
    try {
      const client = await openClient(stack, { device, session: first });
      opened.push(client);
      await client.core.commands.send(CREATE_CREW, { crew_id: firstCrew, name: 'First' });
      await waitFor(async () => (await count(client, 'crews')) === 1, "the first uid's crew");
      await client.db.execute(
        `INSERT INTO local_private (id, kind, data, fetched_at) VALUES (?, 'passport', '{}', ?)`,
        [generateUuidV7(), new Date().toISOString()],
      );
      await client.close();
      opened.pop();

      // The device goes offline and the first uid queues one more op before the switch.
      const offline = await openClient(stack, {
        device,
        session: first,
        offlineBaseUrl: await refusedBaseUrl(),
      });
      opened.push(offline);
      await offline.core.commands.send(CREATE_CREW, { crew_id: generateUuidV7(), name: 'Pending' });
      check((await count(offline, 'commands')) === 1, 'the pending op was not queued');
      await offline.close();
      opened.pop();

      // The next launch is signed in as someone else.
      const switched = await openClient(stack, { device, session: second });
      opened.push(switched);
      for (const table of ['commands', 'cmd_results', 'local_private', 'crews', 'crew_members']) {
        check((await count(switched, table)) === 0, `${table} kept the previous uid's rows`);
      }
      await switched.core.commands.send(CREATE_CREW, { crew_id: secondCrew, name: 'Second' });
      await waitFor(
        async () =>
          (await switched.db.getAll<{ id: string }>('SELECT id FROM crews')).some(
            (row) => row.id === secondCrew,
          ),
        "the second uid's crew",
      );
      await sleep(1000);
      const crews = await switched.db.getAll<{ id: string }>('SELECT id FROM crews');
      check(
        crews.length === 1 && crews[0]?.id === secondCrew,
        `the second uid sees other rows: ${JSON.stringify(crews)}`,
      );
      const pendingOnServer = await stack.pool.query(
        `SELECT 1 FROM cmd_log WHERE uid = $1 AND cmd = 'e2e_create_crew'`,
        [first.uid],
      );
      check(pendingOnServer.rowCount === 1, "the first uid's queued op was sent as someone else");
      log('switching uid wiped rows, queue and private values; only the new uid syncs');
    } finally {
      for (const client of opened) await client.close();
      device.remove();
    }
  },
};
