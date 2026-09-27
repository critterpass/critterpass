import { describe, expect, it } from 'vitest';

import { dcOffset, peakAbs } from '../core/signal';
import { integratedLufs } from '../loudness/lufs';
import { truePeakDb } from '../loudness/peak';
import { buildThemeRegistry } from './registry';
import { renderTheme, type RenderedTheme, type ThemeSpec } from './render-theme';

// A full-length theme render is seconds of pure-TS DSP, and far slower on a shared 2-core CI runner
// that is testing other packages at the same time; each render gets its own generous budget.
const RENDER_BUDGET_MS = 180_000;

const themes = buildThemeRegistry();
const renders = new Map<string, RenderedTheme>();

/** Renders each theme once per file; later tests reuse it instead of paying for another render. */
function renderOnce(spec: ThemeSpec): RenderedTheme {
  const cached = renders.get(spec.guideId);
  if (cached) return cached;
  const rendered = renderTheme(spec);
  renders.set(spec.guideId, rendered);
  return rendered;
}

function pcmBytes(pcm: Float32Array): Buffer {
  return Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
}

function firstTheme(): ThemeSpec {
  const spec = themes[0];
  if (!spec) throw new Error('expected at least one theme');
  return spec;
}

describe('music themes', () => {
  it.each(themes.map((spec) => [spec.guideId, spec] as const))(
    '%s renders a 60-90s finite, DC-clean, peak-safe loop with a closed seam',
    (guideId, spec) => {
      const rendered = renderOnce(spec);
      expect(rendered.durationSec, `${guideId} duration`).toBeGreaterThanOrEqual(58);
      expect(rendered.durationSec, `${guideId} duration`).toBeLessThanOrEqual(92);
      expect(
        rendered.pcm.every((v) => Number.isFinite(v)),
        `${guideId} finite`,
      ).toBe(true);
      expect(peakAbs(rendered.pcm), `${guideId} peak`).toBeLessThanOrEqual(1.001);
      // Peak safety (<= -1 dBTP) always holds, even for a sparse arrangement whose gated integrated
      // loudness sits well below its peaks (docs/decisions/<date>-in-house-procedural-audio.md).
      expect(truePeakDb(rendered.pcm), `${guideId} true peak`).toBeLessThanOrEqual(-0.9);
      expect(Math.abs(dcOffset(rendered.pcm)), `${guideId} DC offset`).toBeLessThan(0.01);
      expect(rendered.loopSeam.wrapJump, `${guideId} wrap jump`).toBe(0);
      // The ~-16 LUFS target is hit exactly for denser arrangements; sparser ones land quieter once
      // peak safety takes precedence, but never absurdly so.
      expect(rendered.loudnessLufs, `${guideId} LUFS`).toBeGreaterThan(-28);
      expect(rendered.loudnessLufs, `${guideId} LUFS`).toBeLessThan(-14);
      expect(rendered.previewPcm.length, `${guideId} preview length`).toBeGreaterThan(0);
      expect(rendered.previewPcm.length, `${guideId} preview length`).toBeLessThanOrEqual(
        rendered.pcm.length,
      );
    },
    RENDER_BUDGET_MS,
  );

  it(
    'is deterministic for the same seed',
    () => {
      const spec = firstTheme();
      const again = renderTheme(spec);
      // Byte comparison: bit-identical PCM, without a deep-equal walk over millions of samples.
      expect(pcmBytes(again.pcm).equals(pcmBytes(renderOnce(spec).pcm))).toBe(true);
    },
    RENDER_BUDGET_MS * 2,
  );

  it(
    'measures loudness consistently with the standalone integratedLufs function',
    () => {
      const rendered = renderOnce(firstTheme());
      expect(integratedLufs(rendered.pcm, rendered.sampleRate)).toBeCloseTo(
        rendered.loudnessLufs,
        5,
      );
    },
    RENDER_BUDGET_MS,
  );

  it('marks exactly the 3 proposed themes as pending founder approval', () => {
    const pending = themes.filter((t) => t.proposalPendingApproval).map((t) => t.guideId);
    expect(pending.sort()).toEqual(['ajo', 'paco', 'sardi']);
  });
});
