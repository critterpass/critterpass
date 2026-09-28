/**
 * Crew chat across two devices on the real stack: A queues messages through its upload queue (the
 * offline door), the api numbers them, B hears each one as a `crew_chat` realtime hint and syncs
 * the rows in A's send order with gap-free `seq`; a replayed batch adds nothing; B's typing reaches
 * A through the publish proxy.
 */
import type { CommandSpec, Subscription } from '../clients';
import { check, sleep, waitFor, type Scenario } from '../support';
import { openCrewPair, type Member } from './crew-pair';

const SEND_MESSAGE: CommandSpec = { name: 'send_message', offline: true };
const MESSAGES = 5;

interface ChatRow {
  readonly id: string;
  readonly seq: number;
  readonly body: string;
}

function listenChat(member: Member, crewId: string, events: Member['events']): () => void {
  return member.client.realtime.channels.acquire('crew_chat', crewId, {
    onEvent: (envelope) => events.push({ ...envelope, at: performance.now() }),
  });
}

export const crewChat: Scenario = {
  name: 'crew-chat',
  description: 'chat messages reach the other device as hints and synced rows, in seq order',
  async run({ stack, log, recordHintLatency }) {
    const pair = await openCrewPair(stack);
    const { a, b, crewId } = pair;
    const aChat: Member['events'] = [];
    const bChat: Member['events'] = [];
    const releaseA = listenChat(a, crewId, aChat);
    const releaseB = listenChat(b, crewId, bChat);
    try {
      await sleep(500);
      const sent: string[] = [];
      for (let n = 1; n <= MESSAGES; n += 1) {
        const sentAt = performance.now();
        const result = await a.client.core.commands.send(SEND_MESSAGE, {
          crew_id: crewId,
          body: `message ${n}`,
        });
        check(result.kind === 'queued', `send ${n} was ${result.kind}`);
        sent.push(result.opId);
        await a.client.core.queue.flush();
        const hinted = () =>
          bChat.find(
            (event) =>
              event.type === 'message.created' &&
              (event.data as { message_id?: string }).message_id === result.opId,
          );
        await waitFor(() => hinted() !== undefined, `hint for message ${n}`);
        recordHintLatency((hinted()?.at ?? 0) - sentAt);
      }

      const synced = async () =>
        b.client.db.getAll<ChatRow>(
          "SELECT id, seq, body FROM messages WHERE crew_id = ? AND sender_kind = 'user' ORDER BY seq",
          [crewId],
        );
      await waitFor(async () => (await synced()).length === MESSAGES, 'B to sync every message');
      const rows = await synced();
      check(
        rows.map((row) => row.id).join() === sent.join(),
        'B does not hold the messages in A’s send order',
      );
      const all = await b.client.db.getAll<{ seq: number }>(
        'SELECT seq FROM messages WHERE crew_id = ? ORDER BY seq',
        [crewId],
      );
      check(
        all.every((row, index) => Number(row.seq) === index + 1),
        'seq has a gap or a repeat',
      );

      await a.client.core.queue.retryNow();
      await sleep(300);
      check((await synced()).length === MESSAGES, 'a replay added a message');

      const typing = b.client.realtime.channels.subscription('crew_chat', crewId) as
        (Subscription & { publish(data: unknown): Promise<unknown> }) | undefined;
      check(typing !== undefined, 'B holds no crew_chat subscription');
      await typing.publish({ type: 'typing' });
      await waitFor(
        () =>
          aChat.some(
            (event) =>
              event.type === 'typing' && (event.data as { uid?: string }).uid === b.session.uid,
          ),
        'A to see B typing',
      );
      log(`${MESSAGES} messages reached B as hints and rows in order; typing reached A`);
    } finally {
      releaseA();
      releaseB();
      a.release();
      b.release();
      await pair.close();
    }
  },
};
