import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { computeArtVersion, loadHashCache, saveHashCache, sha256Hex } from './hash-cache';

describe('sha256Hex', () => {
  it('hashes deterministically and differs for different bytes', () => {
    const a = sha256Hex(new Uint8Array([1, 2, 3]));
    const b = sha256Hex(new Uint8Array([1, 2, 3]));
    const c = sha256Hex(new Uint8Array([1, 2, 4]));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('computeArtVersion', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('is stable for the same manifest content and changes when the manifest changes', () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-artversion-'));
    const manifestPath = join(dir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify({ targets: [] }));
    const first = computeArtVersion(manifestPath);
    const second = computeArtVersion(manifestPath);
    expect(first).toBe(second);

    writeFileSync(manifestPath, JSON.stringify({ targets: [], note: 'changed' }));
    const third = computeArtVersion(manifestPath);
    expect(third).not.toBe(first);
  });
});

describe('hash cache load/save round trip', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('returns an empty cache when the file does not exist', () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-cache-'));
    const cache = loadHashCache(join(dir, 'missing.json'));
    expect(cache).toEqual({ artVersion: '', entries: {} });
  });

  it('round-trips entries and sorts them deterministically on save', () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-cache-'));
    const path = join(dir, 'cache.json');
    saveHashCache(path, { artVersion: 'v1', entries: { b: '2', a: '1' } });
    const reloaded = loadHashCache(path);
    expect(reloaded).toEqual({ artVersion: 'v1', entries: { a: '1', b: '2' } });
    expect(Object.keys(reloaded.entries)).toEqual(['a', 'b']);
  });
});
