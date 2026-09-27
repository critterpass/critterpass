import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadImage } from '@napi-rs/canvas';
import { afterEach, describe, expect, it } from 'vitest';

import { writeOgAtlas } from './og-atlas';

describe('writeOgAtlas', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('packs every sprite into a sheet with a matching, non-overlapping index', async () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-atlas-'));
    const manifestPath = join(dir, 'og-atlas.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        targets: [
          {
            kind: ['gecko', 'tanuki', 'puffin'],
            forms: ['common'],
            poses: ['idle', 'wave'],
            variants: ['color'],
            sizesPt: [48],
            scales: [1],
            format: 'png',
            out: 'sprites',
          },
        ],
      }),
    );

    const result = await writeOgAtlas(manifestPath, dir, 'out/og-atlas', 2);
    expect(result.spriteCount).toBe(6);
    expect(result.sheetCount).toBeGreaterThanOrEqual(1);
    expect(Object.keys(result.index).sort()).toEqual([
      'gecko-common-idle',
      'gecko-common-wave',
      'puffin-common-idle',
      'puffin-common-wave',
      'tanuki-common-idle',
      'tanuki-common-wave',
    ]);

    const sheetPath = join(dir, 'out/og-atlas', 'sheet-0.png');
    expect(existsSync(sheetPath)).toBe(true);
    const sheetImage = await loadImage(readFileSync(sheetPath));

    // No two sprites may occupy overlapping rectangles on the same sheet.
    const rects = Object.values(result.index).filter((r) => r.sheet === 0);
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (!a || !b) continue;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
    for (const rect of rects) {
      expect(rect.x + rect.w).toBeLessThanOrEqual(sheetImage.width);
      expect(rect.y + rect.h).toBeLessThanOrEqual(sheetImage.height);
    }

    const indexPath = join(dir, 'out/og-atlas', 'atlas.json');
    const savedIndex = JSON.parse(readFileSync(indexPath, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(savedIndex).sort()).toEqual(Object.keys(savedIndex));
  }, 20_000);

  it('rejects a manifest with a non-png target', async () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-atlas-'));
    const manifestPath = join(dir, 'og-atlas.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        targets: [
          {
            kind: 'gecko',
            variants: ['color'],
            sizesPt: [48],
            scales: [1],
            format: 'webp',
            out: 'sprites',
          },
        ],
      }),
    );
    await expect(writeOgAtlas(manifestPath, dir, 'out/og-atlas', 2)).rejects.toThrow(
      /must use format "png"/,
    );
  });
});
