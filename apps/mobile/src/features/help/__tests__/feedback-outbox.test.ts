/**
 * The feedback outbox over a real local database: a note with photos waits while the media api
 * cannot be reached, keeps each file's key as its upload lands, and goes into the command queue
 * once, with every key, when the last file is up.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { feedbackPayload, initialDraft } from '../feedback/draft';
import {
  drainFeedbackOutbox,
  readOutbox,
  saveOutboxItem,
  type OutboxPorts,
} from '../feedback/outbox';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>(
      '../../../data/powersync/test-support/node-realm',
    ).powersyncCommon,
);

const TICKET = '0199a3f0-0000-7000-8000-00000000f001';
const DEVICE = {
  os: 'iOS',
  os_version: '26.0',
  app_version: '1.0',
  build: '16',
  model: 'iPhone',
  locale: 'en',
  tz: 'Asia/Ho_Chi_Minh',
  network: 'wifi' as const,
};

const stacks: TestLocalFirst[] = [];
async function open() {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  return stack;
}

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

/** The media api as it answers: a presigned PUT per file, and the bucket taking the bytes. */
function mediaApi(options: { readonly failSecondPut: boolean }) {
  const presigns: unknown[] = [];
  let puts = 0;
  let failNext = options.failSecondPut;
  const ports: OutboxPorts = {
    postJson: (_path, body) => {
      presigns.push(body);
      const n = presigns.length;
      return Promise.resolve({
        status: 200,
        body: {
          media_key: `u/me/feedback/key-${String(n)}`,
          put_url: `https://r2/put-${String(n)}`,
        },
      });
    },
    put: () => {
      puts += 1;
      if (puts === 2 && failNext) {
        failNext = false;
        return Promise.reject(new Error('offline'));
      }
      return Promise.resolve({ status: 200, body: null });
    },
    readBytes: () => Promise.resolve(new Uint8Array([1, 2, 3])),
    sha256: () => Promise.resolve('ab'.repeat(32)),
  };
  return { ports, presigns: () => presigns.length };
}

async function queuedFeedback(stack: TestLocalFirst) {
  const rows = await stack.db.getAll<{ envelope: string }>(
    "SELECT envelope FROM commands WHERE cmd = 'submit_feedback'",
  );
  return rows.map(
    (row) => (JSON.parse(row.envelope) as { payload: { media_keys: string[] } }).payload,
  );
}

describe('the feedback outbox', () => {
  it('waits for every photo, keeps uploaded keys, and queues the note once', async () => {
    const stack = await open();
    const payload = feedbackPayload({
      id: TICKET,
      draft: { ...initialDraft('problem'), text: 'The map froze' },
      device: DEVICE,
      context: { screen: 'map', tripId: null, articleSlug: null },
      source: 'help',
      mediaKeys: [],
    });
    await saveOutboxItem(stack.db, {
      id: TICKET,
      payload,
      files: [
        { uri: 'file:///a.jpg', contentType: 'image/jpeg' },
        { uri: 'file:///b.jpg', contentType: 'image/jpeg' },
      ],
    });
    const api = mediaApi({ failSecondPut: true });

    const first = await drainFeedbackOutbox({ ...stack.value, ports: api.ports });
    expect(first).toBe(0);
    expect(await queuedFeedback(stack)).toEqual([]);
    const [waiting] = await readOutbox(stack.db);
    expect(waiting?.files.map((f) => f.mediaKey)).toEqual(['u/me/feedback/key-1', undefined]);

    const second = await drainFeedbackOutbox({ ...stack.value, ports: api.ports });
    expect(second).toBe(1);
    expect(api.presigns()).toBe(3);
    const queued = await queuedFeedback(stack);
    expect(queued).toHaveLength(1);
    expect(queued[0]?.media_keys).toEqual(['u/me/feedback/key-1', 'u/me/feedback/key-3']);
    expect(await readOutbox(stack.db)).toEqual([]);

    expect(await drainFeedbackOutbox({ ...stack.value, ports: api.ports })).toBe(0);
    expect(await queuedFeedback(stack)).toHaveLength(1);
  });
});
