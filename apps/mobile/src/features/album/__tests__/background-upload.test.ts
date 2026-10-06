import { describe, expect, it } from '@jest/globals';
import type { RegisterPhotoPayload } from '@cp/domain';

import type { SendResult } from '@/data/commands/client';

import {
  BackgroundUploadQueue,
  LINK_RENEWALS_MAX,
  type Api,
  type BackgroundUploadPorts,
  type PendingUpload,
  type TransferSnapshot,
} from '../upload/background-queue';
import { multipartApi, parsePending } from '../upload/device-background';
import { AlbumUploadQueue, joinUploads, type PickedAlbumPhoto } from '../upload/upload-queue';

const TRIP = '00000000-0000-4000-8000-0000000000aa';
const PART = 8 * 1024 * 1024;
const photo = (uri: string): PickedAlbumPhoto => ({ uri, width: 4032, height: 3024 });
const sha = (uri: string) => uri.padEnd(64, '0').slice(0, 64);

/** The system transfer service and the media api as plain state: the boundaries of the queue. */
function world(start: readonly PendingUpload[] = []) {
  const transfers = new Map<string, TransferSnapshot>();
  const registered: RegisterPhotoPayload[] = [];
  const completed: string[] = [];
  const finished: string[] = [];
  const foreground: string[] = [];
  const retried: { id: string; parts: number[] }[] = [];
  let stored: readonly PendingUpload[] = start;
  let n = start.length;
  const state = {
    online: true,
    bytes: 3_000_000,
    prepareFails: false,
    registerAnswer: (): SendResult => ({ kind: 'queued', opId: 'op' }),
  };
  const api = <T>(value: T): Api<T> => (state.online ? { kind: 'ok', value } : { kind: 'offline' });
  const ports: BackgroundUploadPorts = {
    prepare: (uri) =>
      state.prepareFails
        ? Promise.reject(new Error('unreadable'))
        : Promise.resolve({
            path: `/prepared/${uri}`,
            sha256: sha(uri),
            bytes: state.bytes,
            gpsStripped: true,
          }),
    createMultipart: ({ bytes }) =>
      Promise.resolve(
        api({
          mediaKey: `photo/${String(++n)}.jpg`,
          uploadId: `up-${String(n)}`,
          partBytes: PART,
          partCount: Math.ceil(bytes / PART),
        }),
      ),
    partUrls: (_plan, numbers) =>
      Promise.resolve(api(Object.fromEntries(numbers.map((p) => [p, `https://r2/${String(p)}`])))),
    complete: (plan) => {
      if (state.online) completed.push(plan.mediaKey);
      return Promise.resolve(api(true as const));
    },
    enqueue: (request) => {
      transfers.set(request.id, {
        id: request.id,
        state: 'uploading',
        sentBytes: 0,
        totalBytes: request.parts.reduce((sum, part) => sum + part.length, 0),
        parts: request.parts.map((part) => ({ partNumber: part.partNumber, state: 'uploading' })),
      });
      return Promise.resolve();
    },
    retry: (id, urls) => {
      retried.push({ id, parts: Object.keys(urls).map(Number) });
      const transfer = transfers.get(id);
      if (transfer !== undefined) {
        const { failure: _failure, ...rest } = transfer;
        transfers.set(id, { ...rest, state: 'uploading' });
      }
      return Promise.resolve();
    },
    transfers: () => Promise.resolve([...transfers.values()]),
    finish: (id) => {
      finished.push(id);
      transfers.delete(id);
      return Promise.resolve();
    },
    register: (payload) => {
      registered.push(payload);
      return Promise.resolve(state.registerAnswer());
    },
    store: { load: () => stored, save: (all) => (stored = all) },
    foreground: (_tripId, picked) => foreground.push(picked.uri),
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  };
  /** The system finished (or gave up on) a transfer, as it would report with the app open or not. */
  const settle = (id: string, failure?: string) => {
    const transfer = transfers.get(id);
    if (transfer === undefined) throw new Error(`no transfer ${id}`);
    transfers.set(id, {
      ...transfer,
      state: failure === undefined ? 'done' : 'failed',
      ...(failure === undefined ? {} : { failure }),
      sentBytes: failure === undefined ? transfer.totalBytes : 0,
      parts: transfer.parts.map((part) =>
        failure === undefined
          ? { partNumber: part.partNumber, state: 'done', etag: `"e${String(part.partNumber)}"` }
          : { partNumber: part.partNumber, state: 'failed' },
      ),
    });
  };
  const open = () => new BackgroundUploadQueue(ports);
  return {
    ports,
    open,
    settle,
    state,
    registered,
    completed,
    finished,
    foreground,
    retried,
    stored: () => stored,
  };
}

const states = (queue: BackgroundUploadQueue) => queue.items().map((item) => item.state);
const only = (queue: BackgroundUploadQueue) => {
  const [item] = queue.items();
  if (item === undefined) throw new Error('empty queue');
  return item;
};

describe('background album uploads', () => {
  it('hands a photo to the system, then completes and registers it once the transfer is done', async () => {
    const w = world();
    const queue = w.open();
    queue.add(TRIP, [photo('a')], new Set());
    await queue.idle();
    expect(states(queue)).toEqual(['uploading']);
    expect(w.registered).toEqual([]);

    queue.onProgress(only(queue).id, 1_500_000, 3_000_000);
    expect(only(queue).progress).toBeCloseTo(0.475);

    w.settle(only(queue).id);
    queue.onSettled(only(queue).id);
    await queue.idle();
    expect(states(queue)).toEqual(['done']);
    expect(w.completed).toHaveLength(1);
    expect(w.registered).toEqual([
      expect.objectContaining({
        trip_id: TRIP,
        sha256: sha('a'),
        exif_gps_stripped: true,
        photo_id: only(queue).id,
      }),
    ]);
    // The prepared copy is deleted and nothing is left to pick up.
    expect(w.finished).toEqual([only(queue).id]);
    expect(w.stored()).toEqual([]);
  });

  it('skips bytes the album already has, and the same photo picked twice', async () => {
    const w = world();
    const queue = w.open();
    queue.add(TRIP, [photo('a'), photo('b'), photo('b')], new Set([sha('a')]));
    await queue.idle();
    expect(states(queue)).toEqual(['duplicate', 'uploading', 'duplicate']);
  });

  it('picks a transfer up after the app was killed: the system finished it meanwhile', async () => {
    const w = world();
    const before = w.open();
    before.add(TRIP, [photo('a')], new Set());
    await before.idle();
    const { id } = only(before);
    w.settle(id);

    // A new process: only what the phone kept and what the system holds.
    const after = w.open();
    expect(states(after)).toEqual(['uploading']);
    after.resume(new Set());
    await after.idle();
    expect(states(after)).toEqual(['done']);
    expect(w.registered.map((payload) => payload.photo_id)).toEqual([id]);
  });

  it('never completes a multipart upload twice when it died between completing and registering', async () => {
    const w = world();
    w.state.registerAnswer = () => ({ kind: 'unavailable', opId: 'op', code: 'NETWORK' });
    const before = w.open();
    before.add(TRIP, [photo('a')], new Set());
    await before.idle();
    w.settle(only(before).id);
    before.onSettled(only(before).id);
    await before.idle();
    expect(states(before)).toEqual(['waiting']);
    expect(w.completed).toHaveLength(1);

    w.state.registerAnswer = () => ({ kind: 'queued', opId: 'op' });
    const after = w.open();
    after.resume(new Set());
    await after.idle();
    expect(states(after)).toEqual(['done']);
    expect(w.completed).toHaveLength(1);
    expect(w.registered).toHaveLength(2);
  });

  it('waits while the server is out of reach and goes again on resume', async () => {
    const w = world();
    w.state.online = false;
    const queue = w.open();
    queue.add(TRIP, [photo('a')], new Set());
    await queue.idle();
    expect(states(queue)).toEqual(['waiting']);

    w.state.online = true;
    queue.resume(new Set());
    await queue.idle();
    expect(states(queue)).toEqual(['uploading']);
  });

  it('sends only the unsent parts again when the connection dropped mid-transfer', async () => {
    const w = world();
    w.state.bytes = 20_000_000;
    const queue = w.open();
    queue.add(TRIP, [photo('a')], new Set());
    await queue.idle();
    const { id } = only(queue);
    w.settle(id, 'network');
    const transfer = (await w.ports.transfers())[0];
    if (transfer === undefined) throw new Error('no transfer');
    // Part 1 made it before the drop.
    (transfer.parts as { partNumber: number; state: string; etag?: string }[])[0] = {
      partNumber: 1,
      state: 'done',
      etag: '"e1"',
    };
    queue.onSettled(id);
    await queue.idle();
    expect(w.retried).toEqual([{ id, parts: [2, 3] }]);
    expect(states(queue)).toEqual(['uploading']);
  });

  it('renews an expired upload link a few times, then says it failed', async () => {
    const w = world();
    const queue = w.open();
    queue.add(TRIP, [photo('a')], new Set());
    await queue.idle();
    const { id } = only(queue);
    for (let attempt = 0; attempt < LINK_RENEWALS_MAX; attempt += 1) {
      w.settle(id, 'http_403');
      queue.onSettled(id);
      await queue.idle();
      expect(states(queue)).toEqual(['uploading']);
    }
    w.settle(id, 'http_403');
    queue.onSettled(id);
    await queue.idle();
    expect(states(queue)).toEqual(['failed']);
    expect(w.retried).toHaveLength(LINK_RENEWALS_MAX);
  });

  it('marks a refused transfer failed, keeps it failed across a relaunch, and retries only when asked', async () => {
    const w = world();
    const queue = w.open();
    queue.add(TRIP, [photo('a')], new Set());
    await queue.idle();
    const { id } = only(queue);
    w.settle(id, 'http_500');
    queue.onSettled(id);
    await queue.idle();
    expect(states(queue)).toEqual(['failed']);

    const after = w.open();
    after.resume(new Set());
    await after.idle();
    expect(states(after)).toEqual(['failed']);
    expect(w.retried).toEqual([]);

    after.resume(new Set(), true);
    await after.idle();
    expect(w.retried).toEqual([{ id, parts: [1] }]);
    expect(states(after)).toEqual(['uploading']);
  });

  it('marks a photo failed when the server refuses it, and starts over when the system lost it', async () => {
    const w = world();
    w.state.registerAnswer = () => ({
      kind: 'rejected',
      opId: 'op',
      code: 'FORBIDDEN',
      detail: undefined,
    });
    const queue = w.open();
    queue.add(TRIP, [photo('a'), photo('b')], new Set());
    await queue.idle();
    const [a, b] = queue.items();
    if (a === undefined || b === undefined) throw new Error('two photos');
    w.settle(a.id);
    queue.onSettled(a.id);
    // The system's store was cleared under the second photo.
    await w.ports.finish(b.id);
    queue.onSettled(b.id);
    await queue.idle();
    expect(states(queue)).toEqual(['failed', 'failed']);

    w.state.registerAnswer = () => ({ kind: 'queued', opId: 'op' });
    queue.resume(new Set(), true);
    await queue.idle();
    expect(states(queue)).toEqual(['done', 'uploading']);
  });

  it('uploads in the foreground what the system will not take', async () => {
    const w = world();
    w.state.prepareFails = true;
    const queue = w.open();
    queue.add(TRIP, [photo('a')], new Set());
    await queue.idle();
    expect(queue.items()).toEqual([]);
    expect(w.foreground).toEqual(['a']);
  });

  it('shows both queues as one list', async () => {
    const w = world();
    const background = w.open();
    const foreground = new AlbumUploadQueue({
      readBytes: (uri) => Promise.resolve(new TextEncoder().encode(uri)),
      sha256: (bytes) => Promise.resolve(sha(new TextDecoder().decode(bytes))),
      upload: () => Promise.resolve({ kind: 'offline' }),
      register: () => Promise.resolve({ kind: 'queued', opId: 'op' }),
      newId: () => 'fg-1',
    });
    const joined = joinUploads(background, foreground);
    let changes = 0;
    joined.subscribe(() => (changes += 1));
    joined.add(TRIP, [photo('a')], new Set());
    foreground.add(TRIP, [photo('b')], new Set());
    await background.idle();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(joined.items().map((item) => item.state)).toEqual(['uploading', 'waiting']);
    expect(changes).toBeGreaterThan(0);
  });
});

describe('background upload wiring', () => {
  it('reads back only what it wrote', () => {
    expect(parsePending(undefined)).toEqual([]);
    expect(parsePending('not json')).toEqual([]);
    expect(parsePending(JSON.stringify([{ id: 'x' }, null, 3]))).toEqual([]);
    const kept = { id: 'x', tripId: TRIP, photo: photo('a'), stage: 'new', state: 'waiting' };
    expect(parsePending(JSON.stringify([kept]))).toEqual([kept]);
  });

  it('speaks the media api: offline, refused and answered', async () => {
    const calls: string[] = [];
    let answer: () => Promise<{ status: number; body: unknown }> = () =>
      Promise.reject(new Error('no network'));
    const api = multipartApi({
      postJson: (path) => {
        calls.push(path);
        return answer();
      },
    });
    expect(await api.createMultipart({ bytes: 10, sha256: 'ab' })).toEqual({ kind: 'offline' });
    answer = () => Promise.resolve({ status: 413, body: { error: { code: 'PAYLOAD_TOO_LARGE' } } });
    expect(await api.createMultipart({ bytes: 10, sha256: 'ab' })).toEqual({
      kind: 'error',
      code: 'PAYLOAD_TOO_LARGE',
    });
    answer = () =>
      Promise.resolve({
        status: 200,
        body: { parts: [{ part_number: 2, url: 'https://r2/2' }] },
      });
    const plan = { mediaKey: 'photo/u/1.jpg', uploadId: 'up', partBytes: PART, partCount: 2 };
    expect(await api.partUrls(plan, [2])).toEqual({ kind: 'ok', value: { 2: 'https://r2/2' } });
    expect(calls.at(-1)).toBe('/v1/media/multipart/photo%2Fu%2F1.jpg/parts');
  });
});
