/**
 * Chat older than the phone keeps, on the real local-first stack with the api answered from pages
 * in the route's own shape: scrolling past the phone's oldest message reads earlier pages and puts
 * them above its rows, down to the first message and no further; nothing fetched is written to the
 * synced tables or outlives the screen; a page that cannot be read waits for RETRY; reactions come
 * with their page and the member's own reaction or delete shows at once; a row the phone lets go
 * of while pages are open stays in the timeline.
 */
import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { act, configure, renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import {
  OLDER_PAGE,
  readOlder,
  type ChatHistoryApi,
  type ChatHistoryPage,
} from '../older-messages';
import { EMPTY_TIMELINE, leftWindow, type Timeline } from '../timeline';
import { useMessageActions } from '../use-message-actions';
import { useMessages } from '../use-messages';
import { useReactions } from '../use-reactions';

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
const GONE = '0192f000-0000-7000-8000-0000000000d4';
const id = (seq: number) => `0192f000-0000-7000-8000-${String(seq).padStart(12, '0')}`;

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

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
  await stack.db.execute('INSERT INTO users (id, display_name) VALUES (?, ?), (?, ?)', [
    stack.uid,
    'Me Myself',
    MAYA,
    'Maya Tran',
  ]);
  for (let seq = from; seq <= to; seq += 1) {
    await stack.db.execute(
      `INSERT INTO messages (id, crew_id, seq, sender_kind, sender_id, type, body, mentions,
         mentions_guide, attachments, created_at)
       VALUES (?, ?, ?, 'user', ?, 'text', ?, '[]', 0, '[]', '2026-09-28T10:00:00.000000Z')`,
      [id(seq), CREW, seq, MAYA, `m${String(seq)}`],
    );
  }
  return stack;
}

/** A message row as `GET /v1/crews/{crew_id}/chat/messages` sends it. */
function wire(seq: number, sender: string, extra: Record<string, unknown> = {}) {
  return {
    id: id(seq),
    crew_id: CREW,
    trip_id: null,
    seq,
    sender_kind: 'user' as const,
    sender_id: sender,
    guide_id: null,
    type: 'text' as const,
    body: `m${String(seq)}`,
    ref_kind: null,
    ref_id: null,
    reply_to_id: null,
    mentions: '[]',
    mentions_guide: 0,
    attachments: '[]',
    edited_at: null,
    deleted_at: null,
    hidden_at: null,
    in_sync_window: 0,
    created_at: '2026-09-20T10:00:00.000000Z',
    updated_at: '2026-09-20T10:00:00.000000Z',
    ...extra,
  };
}

/** The server's history: every seq below `before`, newest first, `limit` at a time. */
function server(reactions: ChatHistoryPage['reactions'] = []) {
  const calls: [string, number, number][] = [];
  const api: ChatHistoryApi = (crewId, before, limit) => {
    calls.push([crewId, before, limit]);
    const messages = [];
    for (let seq = before - 1; seq >= 1 && messages.length < 2; seq -= 1) {
      messages.push(wire(seq, seq === 1 ? GONE : MAYA));
    }
    const ids = new Set(messages.map((message) => message.id));
    return Promise.resolve({
      messages,
      reactions: reactions.filter((row) => ids.has(row.message_id)),
      has_more: (messages.at(-1)?.seq ?? 1) > 1,
    });
  };
  return { api, calls };
}

describe('older chat pages', () => {
  it('reads earlier pages above the phone’s rows, down to the first message and no further', async () => {
    const stack = await phone(5, 7);
    const { api, calls } = server();
    const { result, unmount } = await renderHook(() => useMessages(CREW, stack.uid, api), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.hasOlder).toBe(true);

    await act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.messages).toHaveLength(5));
    expect(calls).toEqual([[CREW, 5, OLDER_PAGE]]);
    expect(result.current.messages.map((m) => [m.seq, m.senderName])).toEqual([
      [3, 'Maya Tran'],
      [4, 'Maya Tran'],
      [5, 'Maya Tran'],
      [6, 'Maya Tran'],
      [7, 'Maya Tran'],
    ]);
    expect(result.current.hasOlder).toBe(true);

    await act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.messages).toHaveLength(7));
    expect(calls[1]).toEqual([CREW, 3, OLDER_PAGE]);
    expect(result.current.messages[0]?.seq).toBe(1);
    // Someone the phone no longer knows keeps their place under the former-member name.
    expect(result.current.messages[0]?.senderName).toBe('Former member');
    expect(result.current.hasOlder).toBe(false);
    expect(result.current.olderStatus).toBe('idle');

    await act(() => result.current.loadOlder());
    await act(() => result.current.retryOlder());
    expect(calls).toHaveLength(2);

    // Nothing fetched reached the synced table, and closing the chat forgets it.
    const local = await stack.db.getAll('SELECT id FROM messages WHERE crew_id = ?', [CREW]);
    expect(local).toHaveLength(3);
    await unmount();
    expect(readOlder(CREW).messages).toEqual([]);
  });

  it('carries each message’s trip, from a page as from the phone’s own row', async () => {
    const stack = await phone(5, 5);
    await stack.db.execute("UPDATE messages SET trip_id = 't-new' WHERE id = ?", [id(5)]);
    const api: ChatHistoryApi = () =>
      Promise.resolve({
        messages: [wire(4, MAYA, { trip_id: 't-old' })],
        reactions: [],
        has_more: false,
      });
    const { result } = await renderHook(() => useMessages(CREW, stack.uid, api), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    // What a proposal or expense card reads to find its trip.
    expect(result.current.messages.map((m) => [m.seq, m.tripId])).toEqual([
      [4, 't-old'],
      [5, 't-new'],
    ]);
  });

  it('asks the server nothing when the phone holds the first message', async () => {
    const stack = await phone(1, 3);
    const { api, calls } = server();
    const { result } = await renderHook(() => useMessages(CREW, stack.uid, api), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.hasOlder).toBe(false);
    await act(() => result.current.loadOlder());
    expect(calls).toEqual([]);
  });

  it('says a page could not be read and waits for retry', async () => {
    const stack = await phone(5, 7);
    const { api, calls } = server();
    let online = false;
    const flaky: ChatHistoryApi = (...args) => (online ? api(...args) : Promise.resolve(null));
    const { result } = await renderHook(() => useMessages(CREW, stack.uid, flaky), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.olderStatus).toBe('failed'));
    expect(result.current.messages).toHaveLength(3);
    expect(result.current.hasOlder).toBe(true);

    // Reaching the top again does not ask on its own; RETRY does.
    online = true;
    await act(() => result.current.loadOlder());
    expect(calls).toEqual([]);
    await act(() => result.current.retryOlder());
    await waitFor(() => expect(result.current.messages).toHaveLength(5));
    expect(result.current.olderStatus).toBe('idle');
  });

  it('shows a page’s reactions, and the member’s own reaction and delete at once', async () => {
    const stack = await phone(5, 7);
    const { api } = server([
      { message_id: id(4), emoji: '🔥', user_id: MAYA },
      { message_id: id(4), emoji: '🔥', user_id: GONE },
    ]);
    const { result } = await renderHook(
      () => ({
        timeline: useMessages(CREW, stack.uid, api),
        reactions: useReactions(CREW, stack.uid, 200),
        actions: useMessageActions(CREW),
      }),
      { wrapper: stack.wrapper },
    );
    await waitFor(() => expect(result.current.timeline.loaded).toBe(true));
    await act(() => result.current.timeline.loadOlder());
    await waitFor(() => expect(result.current.reactions.groups.get(id(4))).toBeDefined());
    expect(result.current.reactions.groups.get(id(4))).toMatchObject([
      { emoji: '🔥', count: 2, mine: false },
    ]);

    await act(() => result.current.reactions.toggle(id(4), '🔥'));
    await waitFor(() =>
      expect(result.current.reactions.groups.get(id(4))).toMatchObject([
        { emoji: '🔥', count: 3, mine: true },
      ]),
    );
    await act(() => result.current.reactions.toggle(id(4), '🔥'));
    await waitFor(() =>
      expect(result.current.reactions.groups.get(id(4))).toMatchObject([
        { emoji: '🔥', count: 2, mine: false },
      ]),
    );
    const sent = await stack.db.getAll<{ envelope: string }>(
      "SELECT envelope FROM commands WHERE cmd = 'react_message' ORDER BY seq",
    );
    expect(sent.map((row) => (JSON.parse(row.envelope) as { payload: unknown }).payload)).toEqual([
      { message_id: id(4), emoji: '🔥', on: true },
      { message_id: id(4), emoji: '🔥', on: false },
    ]);

    const older = result.current.timeline.messages.find((message) => message.seq === 3);
    await act(() => result.current.actions.remove(older!));
    await waitFor(() =>
      expect(result.current.timeline.messages.find((m) => m.seq === 3)).toMatchObject({
        deleted: true,
        body: '',
      }),
    );
  });
});

describe('rows the phone lets go of', () => {
  const message = (seq: number) => ({ id: id(seq), seq }) as Timeline['messages'][number];
  const timeline = (first: number, last: number, seqs: number[]): Timeline => ({
    ...EMPTY_TIMELINE,
    messages: seqs.map(message),
    firstSeq: first,
    lastSeq: last,
  });

  it('are the ones a newer message pushed out of the window, never one that was hidden', () => {
    const before = timeline(10, 1009, [10, 11, 1009]);
    const pushed = leftWindow(before, timeline(11, 1010, [11, 1009, 1010]));
    expect(pushed.map((m) => m.seq)).toEqual([10]);
    // The oldest row went while it was still inside the window by seq: moderation hid it.
    expect(leftWindow(before, timeline(11, 1009, [11, 1009]))).toEqual([]);
    expect(leftWindow(EMPTY_TIMELINE, before)).toEqual([]);
  });
});
