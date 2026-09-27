import { describe, expect, it } from '@jest/globals';

import { DiskLruCache, MemoryLruCache, StickerCache } from '../cache';
import type { StickerDiskFs } from '../cache';
import { specKey } from '../spec-key';

function bytes(n: number): Uint8Array {
  return new Uint8Array(n).fill(1);
}

describe('MemoryLruCache', () => {
  it('hits after a set and misses for an unknown key', () => {
    const cache = new MemoryLruCache(1024);
    cache.set('a', bytes(10));
    expect(cache.get('a')).toEqual(bytes(10));
    expect(cache.get('missing')).toBeUndefined();
  });

  it('evicts the least-recently-used entry once over the byte cap', () => {
    const cache = new MemoryLruCache(30);
    cache.set('a', bytes(10));
    cache.set('b', bytes(10));
    cache.get('a'); // touch "a" so "b" becomes the LRU entry
    cache.set('c', bytes(15)); // 10+10+15=35 > 30 -> evicts "b"
    expect(cache.get('a')).toBeDefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeDefined();
    expect(cache.bytes).toBeLessThanOrEqual(30);
  });

  it('clears everything on a memory warning', () => {
    const cache = new MemoryLruCache(1024);
    cache.set('a', bytes(10));
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.bytes).toBe(0);
  });
});

function createFakeFs(): StickerDiskFs & {
  readonly files: Map<string, { bytes: Uint8Array; modifiedMs: number }>;
} {
  const files = new Map<string, { bytes: Uint8Array; modifiedMs: number }>();
  let clock = 0;
  return {
    cacheDirectory: '/cache/',
    files,
    exists(path) {
      return Promise.resolve(files.has(path));
    },
    readBytes(path) {
      const entry = files.get(path);
      if (!entry) return Promise.reject(new Error(`not found: ${path}`));
      return Promise.resolve(entry.bytes);
    },
    writeBytes(path, value) {
      clock += 1;
      files.set(path, { bytes: value, modifiedMs: clock });
      return Promise.resolve();
    },
    deleteFile(path) {
      files.delete(path);
      return Promise.resolve();
    },
    listFiles(dir) {
      return Promise.resolve(
        [...files.keys()].filter((p) => p.startsWith(dir)).map((p) => p.slice(dir.length)),
      );
    },
    statFile(path) {
      const entry = files.get(path);
      if (!entry) return Promise.reject(new Error(`not found: ${path}`));
      return Promise.resolve({ size: entry.bytes.byteLength, modifiedMs: entry.modifiedMs });
    },
  };
}

describe('DiskLruCache', () => {
  it('round-trips a write through get', async () => {
    const fs = createFakeFs();
    const cache = new DiskLruCache(fs, 1024);
    await cache.set('a', bytes(10));
    expect(await cache.get('a')).toEqual(bytes(10));
    expect(await cache.get('missing')).toBeUndefined();
  });

  it('sweeps the oldest file once total usage exceeds the cap', async () => {
    const fs = createFakeFs();
    const cache = new DiskLruCache(fs, 25);
    await cache.set('a', bytes(10));
    await cache.set('b', bytes(10));
    await cache.set('c', bytes(10)); // 30 > 25 -> sweep evicts "a" (oldest mtime)
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeDefined();
    expect(await cache.get('c')).toBeDefined();
  });
});

describe('StickerCache', () => {
  it('renders once on a miss, then serves memory then disk without re-rendering', async () => {
    const memory = new MemoryLruCache(1024);
    const disk = new DiskLruCache(createFakeFs(), 1024);
    const cache = new StickerCache(memory, disk);
    let renders = 0;
    const render = () => {
      renders += 1;
      return Promise.resolve(bytes(20));
    };

    await cache.getOrRender('k', render);
    await cache.getOrRender('k', render);
    expect(renders).toBe(1);

    memory.clear();
    const fromDisk = await cache.getOrRender('k', render);
    expect(fromDisk).toEqual(bytes(20));
    expect(renders).toBe(1); // still served from disk, not re-rendered
  });

  it('handleMemoryWarning drops the memory tier only', async () => {
    const memory = new MemoryLruCache(1024);
    const disk = new DiskLruCache(createFakeFs(), 1024);
    const cache = new StickerCache(memory, disk);
    await cache.getOrRender('k', () => Promise.resolve(bytes(5)));
    cache.handleMemoryWarning();
    expect(memory.get('k')).toBeUndefined();
    expect(await disk.get('k')).toBeDefined();
  });

  it('prewarm renders only keys not already in memory', () => {
    const memory = new MemoryLruCache(1024);
    const disk = new DiskLruCache(createFakeFs(), 1024);
    const cache = new StickerCache(memory, disk);
    memory.set('cached', bytes(5));

    const scheduled: Array<() => void> = [];
    cache.prewarm(
      [
        { key: 'cached', render: () => Promise.resolve(bytes(5)) },
        { key: 'fresh', render: () => Promise.resolve(bytes(5)) },
      ],
      (task) => scheduled.push(task),
    );
    expect(scheduled).toHaveLength(1);
  });
});

describe('specKey (cache version invalidation)', () => {
  it('produces a different key when artVersion changes, so a stale render is never reused', () => {
    const spec = { kind: 'gecko', seed: 7 };
    const a = specKey(spec, 96, 2, false, 'v1');
    const b = specKey(spec, 96, 2, false, 'v2');
    expect(a).not.toBe(b);
  });

  it('produces the same key for the same inputs', () => {
    const spec = { kind: 'gecko', seed: 7 };
    expect(specKey(spec, 96, 2, false, 'v1')).toBe(specKey(spec, 96, 2, false, 'v1'));
  });

  it('produces a different key for closedEyes', () => {
    const spec = { kind: 'gecko', seed: 7 };
    expect(specKey(spec, 96, 2, false, 'v1')).not.toBe(specKey(spec, 96, 2, true, 'v1'));
  });
});
