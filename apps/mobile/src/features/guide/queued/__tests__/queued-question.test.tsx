/**
 * The question queued for midnight over the real local-first stack: ASK AT MIDNIGHT goes to the
 * server (online only) and shows at once from its answer, a second one the same day says so, the
 * synced row shows on its own, a rewording shows at once and queues `edit_queued_question`, and
 * CANCEL hides it and queues `cancel_queued_question`.
 */
import { afterEach, describe, expect, it } from '@jest/globals';
import { act, configure, renderHook, waitFor } from '@testing-library/react-native';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import type { SyncTransport } from '@/data/powersync/transport';

import { useQueuedQuestion } from '../use-queued-question';

configure({ asyncUtilTimeout: 5000 });

const THREAD = '0192f000-0000-7000-8000-00000000a001';
const QUESTION = '0192f000-0000-7000-8000-00000000a0e1';
const MIDNIGHT = '2027-04-04T15:00:00.000Z';

/** `POST /v1/cmd/queue_guide_question` as the api answers it, the first time and the second. */
function recordedCommands(paths: string[]): SyncTransport {
  let calls = 0;
  return {
    postJson: (path) => {
      paths.push(path);
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? { status: 200, body: { result: { question_id: QUESTION, answer_after: MIDNIGHT } } }
          : {
              status: 409,
              body: {
                error: {
                  code: 'STATE_INVALID',
                  message: 'already queued',
                  retryable: false,
                  detail: { state: 'already_queued' },
                },
              },
            },
      );
    },
  };
}

const stacks: TestLocalFirst[] = [];
async function open(transport?: SyncTransport) {
  const stack = await openTestLocalFirst({
    holdUploads: true,
    ...(transport === undefined ? {} : { transport }),
  });
  stacks.push(stack);
  await stack.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    stack.uid,
  ]);
  return stack;
}

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

describe('the question queued for midnight', () => {
  it('shows the queued question from the server answer, and refuses a second one', async () => {
    const paths: string[] = [];
    const stack = await open(recordedCommands(paths));
    const { result } = await renderHook(() => useQueuedQuestion(THREAD), {
      wrapper: stack.wrapper,
    });
    await act(async () => {
      await result.current.ask('Can we swap Nara for Uji on day 3?');
    });
    expect(paths).toEqual(['/v1/cmd/queue_guide_question']);
    expect(result.current.queued).toEqual({
      id: QUESTION,
      text: 'Can we swap Nara for Uji on day 3?',
      answerAfter: MIDNIGHT,
    });
    await act(async () => {
      await result.current.ask('And Arashiyama?');
    });
    expect(result.current.problem).toBe('already_queued');
  });

  it('rewords the synced question at once and queues the edit', async () => {
    const stack = await open();
    await stack.db.execute(
      `INSERT INTO queued_guide_questions (id, user_id, thread_id, text, tz, queued_for, queued_at, answer_after, status)
       VALUES (?, ?, ?, 'Is the tea house open?', 'Asia/Tokyo', '2027-04-04', '2027-04-04T07:50:00Z', ?, 'queued')`,
      [QUESTION, stack.uid, THREAD, MIDNIGHT],
    );
    const { result } = await renderHook(() => useQueuedQuestion(THREAD), {
      wrapper: stack.wrapper,
    });
    await waitFor(() => expect(result.current.queued?.text).toBe('Is the tea house open?'));
    await act(async () => {
      result.current.edit('  Is the tea house open on Monday?  ');
      result.current.edit('');
      await Promise.resolve();
    });
    expect(result.current.queued?.text).toBe('Is the tea house open on Monday?');
    await waitFor(async () => {
      const rows = await stack.db.getAll<{ cmd: string }>('SELECT cmd FROM commands');
      expect(rows.map((row) => row.cmd)).toEqual(['edit_queued_question']);
    });
  });

  it('shows the synced question and cancels it', async () => {
    const stack = await open();
    await stack.db.execute(
      `INSERT INTO queued_guide_questions (id, user_id, thread_id, text, tz, queued_for, queued_at, answer_after, status)
       VALUES (?, ?, ?, 'Is the tea house open on Monday?', 'Asia/Tokyo', '2027-04-04', '2027-04-04T07:50:00Z', ?, 'queued')`,
      [QUESTION, stack.uid, THREAD, MIDNIGHT],
    );
    const { result } = await renderHook(() => useQueuedQuestion(THREAD), {
      wrapper: stack.wrapper,
    });
    await waitFor(() =>
      expect(result.current.queued?.text).toBe('Is the tea house open on Monday?'),
    );
    await act(async () => {
      result.current.cancel();
      await Promise.resolve();
    });
    expect(result.current.queued).toBeNull();
    await waitFor(async () => {
      const rows = await stack.db.getAll<{ cmd: string }>('SELECT cmd FROM commands');
      expect(rows.map((row) => row.cmd)).toEqual(['cancel_queued_question']);
    });
  });
});
