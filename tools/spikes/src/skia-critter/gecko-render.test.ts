import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import pixelmatch from 'pixelmatch';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { renderReferenceGeckoPng } from './design-source-reference';
import { buildGeckoDrawing } from './gecko-ops';
import { renderGeckoToPng } from './node-canvas-surface';

// Same threshold as the Skia critter spike criterion: ≤2% pixel diff vs the Node prerender.
// Here the "prerender" is compared to the real, unmodified design source, not to itself, so this
// tests the ported drawing calls' fidelity — not a tautology.
const MAX_DIFF_RATIO = 0.02;
const SIZE = 200;

describe('buildGeckoDrawing', () => {
  it('is deterministic: same palette produces byte-identical ops on every call', () => {
    const a = buildGeckoDrawing();
    const b = buildGeckoDrawing();
    expect(JSON.stringify(a.ops)).toBe(JSON.stringify(b.ops));
    expect(a.totalLineLength).toBe(b.totalLineLength);
  });

  it('produces at least one of every op kind the renderer branches on', () => {
    const { ops } = buildGeckoDrawing();
    const kinds = new Set(ops.map((op) => op.kind));
    expect(kinds).toEqual(new Set(['wash', 'under', 'fill', 'line']));
  });
});

describe('renderGeckoToPng', () => {
  it('renders a full (progress=1) frame within a size×size canvas', () => {
    const { png, renderMs } = renderGeckoToPng({ size: SIZE, progress: 1 });
    const decoded = PNG.sync.read(png);
    expect(decoded.width).toBe(SIZE);
    expect(decoded.height).toBe(SIZE);
    expect(renderMs).toBeGreaterThan(0);
  });

  it('draws strictly more ink as progress advances from 0 to 1 (draw-on budget works)', () => {
    const empty = PNG.sync.read(renderGeckoToPng({ size: SIZE, progress: 0 }).png);
    const half = PNG.sync.read(renderGeckoToPng({ size: SIZE, progress: 0.5 }).png);
    const full = PNG.sync.read(renderGeckoToPng({ size: SIZE, progress: 1 }).png);
    const diffAgainstBlank = new PNG({ width: SIZE, height: SIZE });
    const emptyVsHalf = pixelmatch(empty.data, half.data, diffAgainstBlank.data, SIZE, SIZE, {
      threshold: 0.1,
    });
    const emptyVsFull = pixelmatch(empty.data, full.data, diffAgainstBlank.data, SIZE, SIZE, {
      threshold: 0.1,
    });
    expect(emptyVsHalf).toBeGreaterThan(0);
    expect(emptyVsFull).toBeGreaterThan(emptyVsHalf);
  });
});

// Rendering the design source needs Playwright's Chromium (`pnpm exec playwright install
// chromium`); CI's generic test job has no browser, so this parity probe runs where one is installed.
const hasChromium = existsSync(chromium.executablePath());

describe('gecko port vs the real design source', () => {
  it.skipIf(!hasChromium)(
    'matches design/doodles.js <doodle-art kind="gecko"> within 2% of pixels',
    async () => {
      const [reference, port] = await Promise.all([
        renderReferenceGeckoPng({ size: SIZE, pose: 'idle' }),
        Promise.resolve(renderGeckoToPng({ size: SIZE, progress: 1 }).png),
      ]);
      const expected = PNG.sync.read(reference);
      const actual = PNG.sync.read(port);
      expect(actual.width).toBe(expected.width);
      expect(actual.height).toBe(expected.height);

      const diff = new PNG({ width: expected.width, height: expected.height });
      const differing = pixelmatch(
        expected.data,
        actual.data,
        diff.data,
        expected.width,
        expected.height,
        {
          threshold: 0.1,
        },
      );
      const ratio = differing / (expected.width * expected.height);

      if (ratio > MAX_DIFF_RATIO) {
        const outDir = mkdtempSync(path.join(tmpdir(), 'cp-skia-critter-'));
        writeFileSync(path.join(outDir, 'expected.png'), reference);
        writeFileSync(path.join(outDir, 'actual.png'), port);
        writeFileSync(path.join(outDir, 'diff.png'), PNG.sync.write(diff));
        console.log(
          `gecko port pixel diff ${(ratio * 100).toFixed(2)}% — images written to ${outDir}`,
        );
      }
      expect(ratio).toBeLessThanOrEqual(MAX_DIFF_RATIO);
    },
    30_000,
  );
});
