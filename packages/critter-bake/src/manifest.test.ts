import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { bakeManifestSchema, loadManifest } from './manifest';

describe('bakeManifestSchema', () => {
  it('parses a minimal valid target with defaults applied', () => {
    const result = bakeManifestSchema.parse({
      targets: [{ kind: 'gecko', variants: ['color'], sizesPt: [96], scales: [2], out: 'out' }],
    });
    expect(result.targets[0]).toMatchObject({
      forms: ['common'],
      poses: ['idle'],
      crop: 'none',
      format: 'png',
    });
  });

  it('rejects an unknown variant', () => {
    const result = bakeManifestSchema.safeParse({
      targets: [{ kind: 'gecko', variants: ['glow'], sizesPt: [96], scales: [2], out: 'out' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty targets array', () => {
    const result = bakeManifestSchema.safeParse({ targets: [] });
    expect(result.success).toBe(false);
  });

  it('accepts kind as a string, an array or "all"', () => {
    for (const kind of ['gecko', ['gecko', 'tanuki'], 'all']) {
      const result = bakeManifestSchema.safeParse({
        targets: [{ kind, variants: ['color'], sizesPt: [96], scales: [2], out: 'out' }],
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('loadManifest', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('reads and validates a manifest file', () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-manifest-'));
    const path = join(dir, 'manifest.json');
    writeFileSync(
      path,
      JSON.stringify({
        targets: [{ kind: 'gecko', variants: ['color'], sizesPt: [96], scales: [2], out: 'out' }],
      }),
    );
    const manifest = loadManifest(path);
    expect(manifest.targets).toHaveLength(1);
  });

  it('throws a readable error for an invalid manifest', () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-manifest-'));
    const path = join(dir, 'manifest.json');
    writeFileSync(path, JSON.stringify({ targets: [] }));
    expect(() => loadManifest(path)).toThrow(/invalid bake manifest/);
  });
});
