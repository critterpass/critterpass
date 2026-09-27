/**
 * Removing a member: the membership trigger queues an unsubscribe in the same transaction, the
 * relay executes it (the ex-member's crew channel closes within 1 s), a new subscribe is refused by
 * the subscribe proxy, and the crew's rows leave the ex-member's device through sync.
 */
import { REMOVE_MEMBER } from '../clients';
import { check, sleep, waitFor, type Scenario } from '../support';
import { openCrewPair, syncedCrewNames } from './crew-pair';

const UNSUBSCRIBE_BUDGET_MS = 1000;

export const memberRemoval: Scenario = {
  name: 'member-removal',
  description: 'member removal → unsubscribe within 1 s, and the stream drops the rows',
  async run({ stack, log }) {
    const pair = await openCrewPair(stack);
    const { a, b, crewId } = pair;
    try {
      const subscription = b.client.realtime.channels.subscription('crew', crewId);
      check(subscription?.state === 'subscribed', 'B is not subscribed to the crew channel');
      let unsubscribedAt: number | undefined;
      subscription.on('unsubscribed', () => {
        unsubscribedAt ??= performance.now();
      });

      const sentAt = performance.now();
      const sent = await a.client.core.commands.send(REMOVE_MEMBER, {
        crew_id: crewId,
        user_id: b.session.uid,
      });
      check(sent.kind === 'applied', `removal was ${sent.kind}`);
      await waitFor(() => unsubscribedAt !== undefined, 'B to be unsubscribed', 5_000);
      const elapsed = (unsubscribedAt ?? 0) - sentAt;
      check(elapsed < UNSUBSCRIBE_BUDGET_MS, `unsubscribe took ${elapsed.toFixed(0)} ms`);

      await waitFor(
        async () =>
          (await syncedCrewNames(b.client, crewId)).length === 0 &&
          (
            await b.client.db.get<{ n: number }>(
              'SELECT count(*) AS n FROM crew_members WHERE crew_id = ?',
              [crewId],
            )
          ).n === 0,
        "the crew's rows to leave B's device",
      );
      check((await syncedCrewNames(a.client, crewId)).length === 1, 'A lost the crew');

      // A fresh subscribe from the ex-member is refused by the subscribe proxy.
      b.release();
      let resubscribed = false;
      const again = b.client.realtime.channels.acquire('crew', crewId, {
        onSubscribed: () => {
          resubscribed = true;
        },
      });
      await sleep(1500);
      again();
      check(!resubscribed, 'the ex-member subscribed to the crew channel again');
      log(`unsubscribed ${elapsed.toFixed(0)} ms after the removal was sent; rows dropped by sync`);
    } finally {
      a.release();
      b.release();
      await pair.close();
    }
  },
};
