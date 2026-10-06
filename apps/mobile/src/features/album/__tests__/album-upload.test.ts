import { describe, expect, it } from '@jest/globals';
import type { RegisterPhotoPayload } from '@cp/domain';

import type { SendResult } from '@/data/commands/client';

import { AlbumUploadQueue, exifTakenAt, type AlbumUploadPorts } from '../upload/upload-queue';

const TRIP = '00000000-0000-4000-8000-0000000000aa';

function setup(answer: (payload: RegisterPhotoPayload) => SendResult = () => queued()) {
  let minted = 0;
  const registered: RegisterPhotoPayload[] = [];
  let n = 0;
  let online = true;
  const ports: AlbumUploadPorts = {
    readBytes: (uri) => Promise.resolve(new TextEncoder().encode(uri)),
    sha256: (bytes) =>
      Promise.resolve(new TextDecoder().decode(bytes).padEnd(64, '0').slice(0, 64)),
    upload: (_input, onProgress) => {
      if (!online) return Promise.resolve({ kind: 'offline' });
      onProgress(1);
      return Promise.resolve({ kind: 'uploaded', mediaKey: `photo/${String(++minted)}.jpg` });
    },
    register: (payload) => {
      registered.push(payload);
      return Promise.resolve(answer(payload));
    },
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  };
  const queue = new AlbumUploadQueue(ports);
  const settled = () =>
    new Promise<void>((resolve) => {
      const check = () =>
        queue.items().every((item) => item.state !== 'uploading')
          ? resolve()
          : setTimeout(check, 1);
      check();
    });
  return {
    queue,
    registered,
    settled,
    goOffline: () => (online = false),
    goOnline: () => (online = true),
  };
}

function queued(): SendResult {
  return { kind: 'queued', opId: 'op' };
}

const photo = (uri: string) => ({ uri, width: 4032, height: 3024 });

describe('album upload queue', () => {
  it('uploads and registers each picked photo once, skipping bytes the album already has', async () => {
    const { queue, registered, settled } = setup();
    const known = new Set(['a'.padEnd(64, '0')]);
    queue.add(TRIP, [photo('a'), photo('b'), photo('b')], known);
    await settled();
    expect(queue.items().map((item) => item.state)).toEqual(['duplicate', 'done', 'duplicate']);
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({ trip_id: TRIP, sha256: 'b'.padEnd(64, '0') });
    expect(registered[0]?.media_key).toEqual(expect.any(String));
  });

  it('keeps photos waiting while offline and sends them on resume', async () => {
    const { queue, registered, settled, goOffline, goOnline } = setup();
    goOffline();
    queue.add(TRIP, [photo('c')], new Set());
    await settled();
    expect(queue.items()[0]?.state).toBe('waiting');
    expect(registered).toHaveLength(0);
    goOnline();
    queue.resume(new Set());
    await settled();
    expect(queue.items()[0]?.state).toBe('done');
    expect(registered).toHaveLength(1);
  });

  it('marks a refused registration failed and retries it only when asked', async () => {
    let refuse = true;
    const { queue, registered, settled } = setup(() =>
      refuse ? { kind: 'rejected', opId: 'op', code: 'VALIDATION' } : queued(),
    );
    queue.add(TRIP, [photo('d')], new Set());
    await settled();
    expect(queue.items()[0]?.state).toBe('failed');
    queue.resume(new Set());
    await settled();
    expect(queue.items()[0]?.state).toBe('failed');
    refuse = false;
    queue.resume(new Set(), true);
    await settled();
    expect(queue.items()[0]?.state).toBe('done');
    expect(registered).toHaveLength(2);
  });
});

describe('exifTakenAt', () => {
  it('keeps a camera date only with its offset', () => {
    expect(exifTakenAt('2026:10:04 06:02:11', '+07:00')).toBe('2026-10-04T06:02:11+07:00');
    expect(exifTakenAt('2026:10:04 06:02:11', undefined)).toBeUndefined();
    expect(exifTakenAt('yesterday', '+07:00')).toBeUndefined();
  });
});
