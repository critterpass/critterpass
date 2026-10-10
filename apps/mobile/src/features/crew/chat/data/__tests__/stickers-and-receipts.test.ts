/**
 * Critter stickers and read receipts on the real local-first stack: a sticker send shows at once as
 * a `sticker` entry (form and pose, no text), a refused one fails and RETRY queues the same sticker
 * again; "Read by N" counts active crewmates whose read marker reached the message's `seq`.
 */
import { afterEach, describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import type { SyncTransport } from '@/data/powersync/transport';

import { actionsFor } from '../use-message-actions';
import { loadTimeline } from '../use-messages';
import { loadReadMarkers, readByCount } from '../use-read-receipts';
import { draftProblem, useSendMessage } from '../use-send-message';

const CREW = '0192f000-0000-7000-8000-00000000c1e0';
const FORM = '0192f000-0000-7000-8000-0000000000f1';
const MAYA = '0192f000-0000-7000-8000-0000000000a1';
const LEO = '0192f000-0000-7000-8000-0000000000b2';
const DEV = '0192f000-0000-7000-8000-0000000000c3';

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

const sticker = {
  body: '',
  mentions: [],
  mentions_guide: false,
  attachments: [],
  sticker: { form_id: FORM, pose: 'cheer' as const },
};

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
                code: 'FORBIDDEN',
              })),
            },
          }
        : { status: 503, body: null },
    );
  },
};

describe('sticker sends', () => {
  it('shows a queued sticker at once as its form and pose', async () => {
    const stack = await open();
    expect(draftProblem(sticker)).toBeNull();
    const { result } = await renderHook(() => useSendMessage(CREW), { wrapper: stack.wrapper });
    const sent = await result.current.send(sticker);
    const [entry] = (await loadTimeline(stack.db, CREW, stack.uid)).messages;
    expect(entry).toMatchObject({
      id: sent?.opId,
      type: 'sticker',
      body: 'cheer',
      refKind: 'critter_form',
      refId: FORM,
      status: 'sending',
    });
  });

  it('turns a refused sticker into a failed entry that RETRY sends as the same sticker', async () => {
    const stack = await open({ transport: refusing });
    const { result } = await renderHook(() => useSendMessage(CREW), { wrapper: stack.wrapper });
    await result.current.send(sticker);
    await stack.value.queue.flush();
    const [failed] = (await loadTimeline(stack.db, CREW, stack.uid)).messages;
    expect(failed).toMatchObject({ type: 'sticker', refId: FORM, status: 'failed' });

    await result.current.retry(failed!);
    const [retried] = (await loadTimeline(stack.db, CREW, stack.uid)).messages;
    expect(retried).toMatchObject({
      type: 'sticker',
      body: 'cheer',
      refId: FORM,
      status: 'sending',
    });
  });

  it('never offers to copy a sticker', async () => {
    const stack = await open();
    const { result } = await renderHook(() => useSendMessage(CREW), { wrapper: stack.wrapper });
    await result.current.send(sticker);
    const [entry] = (await loadTimeline(stack.db, CREW, stack.uid)).messages;
    const sent = { ...entry!, status: 'sent' as const };
    expect(actionsFor(sent, MAYA)).toEqual(['reply', 'report', 'mute']);
    expect(actionsFor(sent, stack.uid)).toEqual(['reply', 'delete']);
  });
});

describe('read receipts', () => {
  it('counts active crewmates whose marker reached the message, never yourself or former members', async () => {
    const stack = await open();
    const rows: [string, string, number][] = [
      [stack.uid, 'active', 9],
      [MAYA, 'active', 7],
      [LEO, 'active', 4],
      [DEV, 'former', 9],
    ];
    for (const [uid, status, seq] of rows) {
      await stack.db.execute(
        'INSERT INTO crew_members (id, crew_id, user_id, status, last_read_seq) VALUES (?, ?, ?, ?, ?)',
        [`cm-${uid}`, CREW, uid, status, seq],
      );
    }
    const markers = await loadReadMarkers(stack.db, CREW, stack.uid);
    expect(readByCount(markers, 4)).toBe(2);
    expect(readByCount(markers, 5)).toBe(1);
    expect(readByCount(markers, 8)).toBe(0);
    expect(readByCount(markers, null)).toBe(0);
  });
});
