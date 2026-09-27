/**
 * Two members of one crew: each rename is committed by the api, published by the worker's outbox
 * relay through Centrifugo, and reaches both devices as a realtime hint (timed from the moment the
 * command is sent), while the renamed row itself arrives on both through sync.
 */
import { RENAME_CREW_ONLINE } from '../clients';
import { check, sleep, waitFor, type Scenario } from '../support';
import { openCrewPair, syncedCrewNames } from './crew-pair';

const ROUNDS = 30;

export const realtimeFanout: Scenario = {
  name: 'realtime-fanout',
  description: `two clients see ${ROUNDS} realtime hints (p95 < 1 s) and the rows via sync`,
  async run({ stack, log, recordHintLatency }) {
    const pair = await openCrewPair(stack);
    const { a, b, crewId } = pair;
    try {
      let name = '';
      for (let round = 1; round <= ROUNDS; round += 1) {
        name = `Round ${round}`;
        const sentAt = performance.now();
        const sent = await a.client.core.commands.send(RENAME_CREW_ONLINE, {
          crew_id: crewId,
          name,
        });
        check(sent.kind === 'applied', `rename ${round} was ${sent.kind}`);
        const hinted = (member: typeof a) =>
          member.events.find(
            (event) =>
              event.type === 'crew.renamed' && (event.data as { name?: string }).name === name,
          );
        await waitFor(() => hinted(a) !== undefined && hinted(b) !== undefined, `hint ${round}`);
        for (const member of [a, b]) recordHintLatency((hinted(member)?.at ?? 0) - sentAt);
        await sleep(20);
      }
      for (const member of [a, b]) {
        const ids = member.events.map((event) => event.id);
        check(new Set(ids).size === ids.length, 'a hint was delivered twice');
        await waitFor(
          async () => (await syncedCrewNames(member.client, crewId))[0]?.name === name,
          'the last rename to sync to both devices',
        );
      }
      log(`${ROUNDS} hints reached both devices; both synced the final row`);
    } finally {
      a.release();
      b.release();
      await pair.close();
    }
  },
};
