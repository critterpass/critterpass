/**
 * The chat data layer on the real local-first stack (encrypted Node database, upload queue,
 * command client): the timeline orders by server `seq` and appends this device's unacknowledged
 * sends in queue order whatever the device clock says; a refused send turns into a failed entry
 * that RETRY queues again; unread counts and the read marker key on `seq`; reactions group per
 * emoji and toggle with an explicit outcome; muted crewmates drop out of the timeline, at once when muted on this device.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, configure, renderHook, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import type { SyncTransport } from '@/data/powersync/transport';

import { loadReactions, useReactions } from '../use-reactions';
import { useMessageActions } from '../use-message-actions';
import { loadTimeline, useMessages } from '../use-messages';
import { draftProblem, useSendMessage } from '../use-send-message';
import { MARK_READ_DEBOUNCE_MS, unreadCount, useMarkRead } from '../use-unread-count';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>(
      '../../../../../data/powersync/test-support/node-realm',
    ).powersyncCommon,
);

// Live queries on the encrypted database settle slower on CI runners than on a laptop.
configure({ asyncUtilTimeout: 5000 });

const CREW = '0192f000-0000-7000-8000-00000000c1e0';
const MAYA = '0192f000-0000-7000-8000-0000000000a1';
const LEO = '0192f000-0000-7000-8000-0000000000b2';

const stacks: TestLocalFirst[] = [];
async function open(options: Parameters<typeof openTestLocalFirst>[0] = {}) {
  const stack = await openTestLocalFirst({ holdUploads: true, ...options });
  stacks.push(stack);
  return stack;
}

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

async function seed(stack: TestLocalFirst): Promise<void> {
  const { db, uid } = stack;
  await db.execute('INSERT INTO users (id, display_name) VALUES (?, ?), (?, ?), (?, ?)', [
    uid,
    'Me Myself',
    MAYA,
    'Maya Tran',
    LEO,
    'Leo',
  ]);
  for (const member of [uid, MAYA, LEO]) {
    await db.execute(
      "INSERT INTO crew_members (id, crew_id, user_id, status, last_read_seq) VALUES (?, ?, ?, 'active', 0)",
      [`cm-${member}`, CREW, member],
    );
  }
}

let nextId = 0;
async function synced(
  stack: TestLocalFirst,
  seq: number,
  sender: string | null,
  body: string,
  createdAt = '2026-09-28T10:00:00Z',
): Promise<string> {
  nextId += 1;
  const id = `0192f000-0000-7000-8000-${String(nextId).padStart(12, '0')}`;
  await stack.db.execute(
    `INSERT INTO messages (id, crew_id, seq, sender_kind, sender_id, type, body, mentions,
       mentions_guide, attachments, created_at)
     VALUES (?, ?, ?, ?, ?, 'text', ?, '[]', 0, '[]', ?)`,
    [id, CREW, seq, sender === null ? 'system' : 'user', sender, body, createdAt],
  );
  return id;
}

const draft = (body: string) => ({ body, mentions: [], mentions_guide: false, attachments: [] });

describe('timeline', () => {
  it('orders by seq, then this device’s sends in queue order, whatever the clocks say', async () => {
    const stack = await open();
    await seed(stack);
    // Server rows arrive with created_at that disagrees with seq (skewed sender clocks).
    await synced(stack, 2, MAYA, 'second', '2026-09-28T08:00:00Z');
    await synced(stack, 1, LEO, 'first', '2026-09-28T11:00:00Z');
    const { result } = await renderHook(() => useSendMessage(CREW), { wrapper: stack.wrapper });
    const a = await result.current.send(draft('mine A'));
    const b = await result.current.send(draft('  mine B  '));

    const timeline = await loadTimeline(stack.db, CREW, stack.uid);
    expect(timeline.messages.map((m) => [m.body, m.seq, m.status])).toEqual([
      ['first', 1, 'sent'],
      ['second', 2, 'sent'],
      ['mine A', null, 'sending'],
      ['mine B', null, 'sending'],
    ]);
    expect(timeline.messages.slice(2).map((m) => m.id)).toEqual([a?.opId, b?.opId]);
    expect(timeline.lastSeq).toBe(2);

    // Once the server's row syncs under the same id, the local copy gives way to it.
    await stack.db.execute(
      `INSERT INTO messages (id, crew_id, seq, sender_kind, sender_id, type, body, created_at)
       VALUES (?, ?, 3, 'user', ?, 'text', 'mine A', '2026-09-28T12:00:00Z')`,
      [a?.opId, CREW, stack.uid],
    );
    const after = await loadTimeline(stack.db, CREW, stack.uid);
    expect(after.messages.map((m) => [m.body, m.seq])).toEqual([
      ['first', 1],
      ['second', 2],
      ['mine A', 3],
      ['mine B', null],
    ]);
  });

  it('loads the newest window first and older windows on demand', async () => {
    const stack = await open();
    await seed(stack);
    for (let seq = 1; seq <= 205; seq += 1) await synced(stack, seq, MAYA, `m${seq}`);
    const { result } = await renderHook(() => useMessages(CREW, stack.uid), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.messages).toHaveLength(200);
    expect(result.current.messages[0]?.body).toBe('m6');
    expect(result.current.hasOlder).toBe(true);
    await act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.messages).toHaveLength(205));
    expect(result.current.hasOlder).toBe(false);
  });

  it('keeps the message objects of rows a reload did not change', async () => {
    const stack = await open();
    await seed(stack);
    await synced(stack, 1, MAYA, 'first');
    const second = await synced(stack, 2, LEO, 'second');
    const { result } = await renderHook(() => useMessages(CREW, stack.uid), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    const [first, edited] = result.current.messages;

    // A new message lands: the two already shown are the same objects, so their rows stay put.
    await synced(stack, 3, MAYA, 'third');
    await waitFor(() => expect(result.current.messages).toHaveLength(3));
    expect(result.current.messages[0]).toBe(first);
    expect(result.current.messages[1]).toBe(edited);

    // An edit replaces that one message only.
    const before = result.current.messages;
    await stack.db.execute(
      "UPDATE messages SET body = 'second, edited', edited_at = '1' WHERE id = ?",
      [second],
    );
    await waitFor(() => expect(result.current.messages[1]?.body).toBe('second, edited'));
    expect(result.current.messages[0]).toBe(first);
    expect(result.current.messages[1]).not.toBe(edited);
    expect(result.current.messages[2]).toBe(before[2]);

    // A change to a watched table that leaves the timeline alone hands back the same list.
    const held = result.current.messages;
    await stack.db.execute("UPDATE users SET display_name = 'Me Again' WHERE id = ?", [stack.uid]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(result.current.messages).toBe(held);
  });

  it('leaves out muted crewmates but never the member’s own messages', async () => {
    const stack = await open();
    await seed(stack);
    await synced(stack, 1, MAYA, 'from maya');
    await synced(stack, 2, LEO, 'from leo');
    await synced(stack, 3, stack.uid, 'from me');
    await stack.db.execute('INSERT INTO user_settings (id, user_id, muted_uids) VALUES (?, ?, ?)', [
      stack.uid,
      stack.uid,
      JSON.stringify([LEO]),
    ]);
    const timeline = await loadTimeline(stack.db, CREW, stack.uid);
    expect(timeline.messages.map((m) => m.body)).toEqual(['from maya', 'from me']);
  });

  it('hides a crewmate muted on this device before the setting syncs back', async () => {
    const stack = await open();
    await seed(stack);
    await synced(stack, 1, MAYA, 'from maya');
    await synced(stack, 2, LEO, 'from leo');
    const { result } = await renderHook(() => useMessageActions(CREW), { wrapper: stack.wrapper });

    await result.current.mute(LEO, true);
    const muted = await loadTimeline(stack.db, CREW, stack.uid);
    expect(muted.messages.map((m) => m.body)).toEqual(['from maya']);

    // A later unmute in the same queue wins.
    await result.current.mute(LEO, false);
    const unmuted = await loadTimeline(stack.db, CREW, stack.uid);
    expect(unmuted.messages.map((m) => m.body)).toEqual(['from maya', 'from leo']);
  });
});

describe('sending', () => {
  it('refuses empty, overlong and unsafe drafts before queuing', () => {
    expect(draftProblem(draft('   '))).toBe('empty');
    expect(draftProblem(draft('x'.repeat(4001)))).toBe('too_long');
    expect(draftProblem(draft('tap javascript:alert(1)'))).toBe('unsafe_link');
    expect(draftProblem(draft('see https://critterpass.app'))).toBeNull();
  });

  it('turns a refused send into a failed entry that RETRY queues again', async () => {
    const refusing: SyncTransport = {
      postJson: (path, body) => {
        const ops = (body as { ops?: { op_id: string }[] }).ops ?? [];
        return Promise.resolve(
          path === '/sync/upload'
            ? {
                status: 200,
                body: {
                  results: ops.map((op) => ({
                    op_id: op.op_id,
                    status: 'rejected',
                    code: 'NOT_FOUND',
                  })),
                },
              }
            : { status: 503, body: null },
        );
      },
    };
    const stack = await open({ transport: refusing });
    await seed(stack);
    const { result } = await renderHook(() => useSendMessage(CREW), { wrapper: stack.wrapper });
    const sent = await result.current.send(draft('hello?'));
    await stack.value.queue.flush();

    const failed = (await loadTimeline(stack.db, CREW, stack.uid)).messages;
    expect(failed.map((m) => [m.id, m.body, m.status, m.failureCode])).toEqual([
      [sent?.opId, 'hello?', 'failed', 'NOT_FOUND'],
    ]);

    const retried = await result.current.retry(failed[0]!);
    const timeline = (await loadTimeline(stack.db, CREW, stack.uid)).messages;
    expect(timeline.map((m) => [m.id, m.status])).toEqual([[retried?.opId, 'sending']]);
    expect(retried?.opId).not.toBe(sent?.opId);
  });
});

describe('unread', () => {
  it('counts crewmates’ messages past the read marker by seq, not by clock', async () => {
    const stack = await open();
    await seed(stack);
    await synced(stack, 1, null, 'Leo joined');
    await synced(stack, 2, MAYA, 'hi', '2031-01-01T00:00:00Z');
    await synced(stack, 3, stack.uid, 'mine');
    await synced(stack, 4, LEO, 'yo', '2020-01-01T00:00:00Z');
    expect(await unreadCount(stack.db, CREW, stack.uid)).toBe(2);
    await stack.db.execute('UPDATE crew_members SET last_read_seq = 2 WHERE user_id = ?', [
      stack.uid,
    ]);
    expect(await unreadCount(stack.db, CREW, stack.uid)).toBe(1);
  });

  it('marks read once after a second at the bottom, and never backwards', async () => {
    const stack = await open();
    const { result, rerender } = await renderHook(
      ({ stored }: { stored: number }) => useMarkRead(CREW, stored),
      { wrapper: stack.wrapper, initialProps: { stored: 5 } },
    );
    await act(() => {
      result.current(4);
      result.current(7);
      result.current(8);
    });
    const marks = async () =>
      (
        await stack.db.getAll<{ envelope: string }>(
          "SELECT envelope FROM commands WHERE cmd = 'mark_read'",
        )
      ).map((row) => (JSON.parse(row.envelope) as { payload: unknown }).payload);
    expect(await marks()).toEqual([]);
    await waitFor(async () => expect(await marks()).toEqual([{ crew_id: CREW, seq: 8 }]), {
      timeout: MARK_READ_DEBOUNCE_MS * 3,
    });
    await rerender({ stored: 8 });
    await act(() => result.current(6));
    await new Promise((resolve) => setTimeout(resolve, MARK_READ_DEBOUNCE_MS + 200));
    expect(await marks()).toEqual([{ crew_id: CREW, seq: 8 }]);
  });
});

describe('reactions', () => {
  it('groups per emoji with who reacted, and toggles with an explicit outcome', async () => {
    const stack = await open();
    await seed(stack);
    const message = await synced(stack, 1, MAYA, 'beach?');
    await stack.db.execute(
      `INSERT INTO message_reactions (id, message_id, crew_id, user_id, emoji, created_at)
       VALUES ('r1', ?, ?, ?, '🔥', '1'), ('r2', ?, ?, ?, '🔥', '2'), ('r3', ?, ?, ?, '👍', '3')`,
      [message, CREW, MAYA, message, CREW, stack.uid, message, CREW, LEO],
    );
    const groups = await loadReactions(stack.db, CREW, stack.uid, 200);
    expect(groups.get(message)).toEqual([
      {
        emoji: '🔥',
        count: 2,
        mine: true,
        users: [
          { uid: MAYA, name: 'Maya Tran' },
          { uid: stack.uid, name: 'Me Myself' },
        ],
      },
      { emoji: '👍', count: 1, mine: false, users: [{ uid: LEO, name: 'Leo' }] },
    ]);

    const { result } = await renderHook(() => useReactions(CREW, stack.uid, 200), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.groups.size).toBe(1));
    await result.current.toggle(message, '🔥');
    await result.current.toggle(message, '👍');
    const payloads = await stack.db.getAll<{ envelope: string }>(
      "SELECT envelope FROM commands WHERE cmd = 'react_message' ORDER BY seq",
    );
    expect(
      payloads.map((row) => (JSON.parse(row.envelope) as { payload: unknown }).payload),
    ).toEqual([
      { message_id: message, emoji: '🔥', on: false },
      { message_id: message, emoji: '👍', on: true },
    ]);
  });
});
