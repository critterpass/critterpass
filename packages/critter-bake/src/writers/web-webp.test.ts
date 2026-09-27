import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadImage } from '@napi-rs/canvas';
import { afterEach, describe, expect, it } from 'vitest';

import { writeWebWebp } from './web-webp';

describe('writeWebWebp', () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('writes decodable WebP files and a sorted srcset index', async () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-web-'));
    const manifestPath = join(dir, 'web.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        targets: [
          {
            kind: ['gecko', 'tanuki'],
            forms: ['common'],
            poses: ['idle'],
            variants: ['color'],
            sizesPt: [48, 96],
            scales: [1],
            format: 'webp',
            out: 'critters',
          },
        ],
      }),
    );

    const result = await writeWebWebp(manifestPath, dir, 2);
    expect(result.fileCount).toBe(4);

    const geckoEntries = result.index['gecko-common-idle'];
    expect(geckoEntries).toHaveLength(2);
    expect(geckoEntries?.map((e) => e.sizePt)).toEqual([48, 96]);

    for (const entries of Object.values(result.index)) {
      for (const entry of entries) {
        const filePath = join(dir, entry.url.replace(/^\//, ''));
        expect(existsSync(filePath)).toBe(true);
        const image = await loadImage(readFileSync(filePath));
        expect(image.width).toBeGreaterThan(0);
      }
    }

    const indexPath = join(dir, 'critters', 'srcset.json');
    expect(existsSync(indexPath)).toBe(true);
    const savedIndex = JSON.parse(readFileSync(indexPath, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(savedIndex).sort()).toEqual(Object.keys(savedIndex));
  }, 20_000);

  it('rejects a manifest with a non-webp target', async () => {
    dir = mkdtempSync(join(tmpdir(), 'critter-bake-web-'));
    const manifestPath = join(dir, 'web.json');
    writeFileSync(
      manifestPath,
      JSON.stringify({
        targets: [
          {
            kind: 'gecko',
            variants: ['color'],
            sizesPt: [48],
            scales: [1],
            format: 'png',
            out: 'critters',
          },
        ],
      }),
    );
    await expect(writeWebWebp(manifestPath, dir, 2)).rejects.toThrow(/must use format "webp"/);
  });
});
