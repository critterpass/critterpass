/**
 * The phone's window moving under an open chat, on the real local-first stack with the api answered
 * from pages in the route's own shape. A new message pushes the oldest row off the phone: with
 * older pages asked for or on screen, that row stays in the timeline, so the page above it joins on
 * without a gap whether it lands, or fails and is asked for again.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, configure, renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import {
  CHAT_SYNC_WINDOW,
  OLDER_PAGE,
  type ChatHistoryApi,
  type ChatHistoryPage,
} from '../older-messages';
import { MESSAGE_WINDOW, useMessages } from '../use-messages';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>(
      '../../../../../data/powersync/test-support/node-realm',
    ).powersyncCommon,
);

configure({ asyncUtilTimeout: 5000 });

const CREW = '0192f000-0000-7000-8000-00000000c1e0';
const MAYA = '0192f000-0000-7000-8000-0000000000a1';
const id = (seq: number) => `0192f000-0000-7000-8000-${String(seq).padStart(12, '0')}`;
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

const INSERT_MESSAGE = `INSERT INTO messages (id, crew_id, seq, sender_kind, sender_id, type, body,
    mentions, mentions_guide, attachments, created_at)
  VALUES (?, ?, ?, 'user', ?, 'text', ?, '[]', 0, '[]', '2026-09-28T10:00:00.000000Z')`;
const message = (seq: number) => [id(seq), CREW, seq, MAYA, `m${String(seq)}`];

const stacks: TestLocalFirst[] = [];
afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

/** A phone holding messages `from`..`to` of the crew (its window), sent by Maya. */
async function phone(from: number, to: number): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  await stack.db.writeTransaction(async (tx) => {
    await tx.execute('INSERT INTO users (id, display_name) VALUES (?, ?), (?, ?)', [
      stack.uid,
      'Me Myself',
      MAYA,
      'Maya Tran',
    ]);
    for (const seq of range(from, to)) await tx.execute(INSERT_MESSAGE, message(seq));
  });
  return stack;
}

/** One sync step: message `arrives` reaches the phone and pushes `leaves` out of its window. */
function slide(stack: TestLocalFirst, arrives: number, leaves: number): Promise<void> {
  return stack.db.writeTransaction(async (tx) => {
    await tx.execute('DELETE FROM messages WHERE id = ?', [id(leaves)]);
    await tx.execute(INSERT_MESSAGE, message(arrives));
  });
}

/** A message row as `GET /v1/crews/{crew_id}/chat/messages` sends it. */
function wire(seq: number): ChatHistoryPage['messages'][number] {
  return {
    id: id(seq),
    crew_id: CREW,
    seq,
    sender_kind: 'user',
    sender_id: MAYA,
    guide_id: null,
    type: 'text',
    body: `m${String(seq)}`,
    ref_kind: null,
    ref_id: null,
    reply_to_id: null,
    mentions: '[]',
    mentions_guide: 0,
    attachments: '[]',
    edited_at: null,
    deleted_at: null,
    created_at: '2026-09-20T10:00:00.000000Z',
  };
}

/** The two messages below `before`, as the server pages them. */
function pageBelow(before: number): ChatHistoryPage {
  const messages = [before - 1, before - 2].filter((seq) => seq >= 1).map(wire);
  return { messages, reactions: [], has_more: (messages.at(-1)?.seq ?? 1) > 1 };
}

/** An api whose every answer waits for the test to give it. */
function slowServer() {
  const calls: [string, number, number][] = [];
  const answers: ((page: ChatHistoryPage | null) => void)[] = [];
  const api: ChatHistoryApi = (crewId, before, limit) => {
    calls.push([crewId, before, limit]);
    return new Promise((resolve) => answers.push(resolve));
  };
  return { api, calls, answers };
}

type Chat = { readonly current: ReturnType<typeof useMessages> };
const seqs = (chat: Chat) => chat.current.messages.map((m) => m.seq);

/** Scrolls up through everything the phone holds, to where the next step asks the server. */
async function reachTop(chat: Chat, held: number): Promise<void> {
  for (let shown = MESSAGE_WINDOW; shown < held; shown += MESSAGE_WINDOW) {
    await act(() => chat.current.loadOlder());
    await waitFor(() => expect(chat.current.messages).toHaveLength(shown + MESSAGE_WINDOW));
  }
}

// A thousand rows on the encrypted database, read five windows deep: slow on a CI runner.
jest.setTimeout(60_000);

describe('a row leaving the phone while the page above it is on its way', () => {
  const FIRST = 5;
  const LAST = FIRST + CHAT_SYNC_WINDOW - 1;

  async function openAtTop() {
    const stack = await phone(FIRST, LAST);
    const server = slowServer();
    const { result } = await renderHook(() => useMessages(CREW, stack.uid, server.api), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await reachTop(result, CHAT_SYNC_WINDOW);
    await act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.olderStatus).toBe('loading'));
    expect(server.calls).toEqual([[CREW, FIRST, OLDER_PAGE]]);
    return { stack, server, result };
  }

  it('keeps the timeline whole and in order once the page lands', async () => {
    const { stack, server, result } = await openAtTop();

    await slide(stack, LAST + 1, FIRST);
    await waitFor(() => expect(result.current.lastSeq).toBe(LAST + 1));
    await act(() => server.answers[0]?.(pageBelow(FIRST)));
    await waitFor(() => expect(result.current.olderStatus).toBe('idle'));

    expect(seqs(result)).toEqual(range(FIRST - 2, LAST + 1));
  });

  it('asks again from the oldest message in hand after a page that failed', async () => {
    const { stack, server, result } = await openAtTop();

    await slide(stack, LAST + 1, FIRST);
    await waitFor(() => expect(result.current.lastSeq).toBe(LAST + 1));
    await act(() => server.answers[0]?.(null));
    await waitFor(() => expect(result.current.olderStatus).toBe('failed'));
    expect(seqs(result)).toEqual(range(FIRST, LAST + 1));

    await act(() => result.current.retryOlder());
    await waitFor(() => expect(server.calls).toHaveLength(2));
    expect(server.calls[1]).toEqual([CREW, FIRST, OLDER_PAGE]);
    await act(() => server.answers[1]?.(pageBelow(FIRST)));
    await waitFor(() => expect(result.current.olderStatus).toBe('idle'));

    expect(seqs(result)).toEqual(range(FIRST - 2, LAST + 1));
  });
});
