import { describe, expect, it } from 'vitest';

import { dcOffset, peakAbs } from '../core/signal';
import { integratedLufs } from '../loudness/lufs';
import { truePeakDb } from '../loudness/peak';
import { buildThemeRegistry } from './registry';
import { renderTheme } from './render-theme';

describe('music themes', () => {
  const themes = buildThemeRegistry();

  it('every theme renders a 60-90s finite, DC-clean, peak-safe loop with a closed seam', () => {
    for (const spec of themes) {
      const rendered = renderTheme(spec);
      expect(rendered.durationSec, `${spec.guideId} duration`).toBeGreaterThanOrEqual(58);
      expect(rendered.durationSec, `${spec.guideId} duration`).toBeLessThanOrEqual(92);
      expect(
        rendered.pcm.every((v) => Number.isFinite(v)),
        `${spec.guideId} finite`,
      ).toBe(true);
      expect(peakAbs(rendered.pcm), `${spec.guideId} peak`).toBeLessThanOrEqual(1.001);
      // Peak safety (<= -1 dBTP) always holds, even for a sparse arrangement whose gated integrated
      // loudness sits well below its peaks (docs/decisions/<date>-in-house-procedural-audio.md).
      expect(truePeakDb(rendered.pcm), `${spec.guideId} true peak`).toBeLessThanOrEqual(-0.9);
      expect(Math.abs(dcOffset(rendered.pcm)), `${spec.guideId} DC offset`).toBeLessThan(0.01);
      expect(rendered.loopSeam.wrapJump, `${spec.guideId} wrap jump`).toBe(0);
      // The ~-16 LUFS target is hit exactly for denser arrangements; sparser ones land quieter once
      // peak safety takes precedence, but never absurdly so.
      expect(rendered.loudnessLufs, `${spec.guideId} LUFS`).toBeGreaterThan(-28);
      expect(rendered.loudnessLufs, `${spec.guideId} LUFS`).toBeLessThan(-14);
      expect(rendered.previewPcm.length, `${spec.guideId} preview length`).toBeGreaterThan(0);
      expect(rendered.previewPcm.length, `${spec.guideId} preview length`).toBeLessThanOrEqual(
        rendered.pcm.length,
      );
    }
  }, 60000);

  it('is deterministic for the same seed', () => {
    const spec = themes[0];
    if (!spec) throw new Error('expected at least one theme');
    const a = renderTheme(spec);
    const b = renderTheme(spec);
    expect(Array.from(a.pcm)).toEqual(Array.from(b.pcm));
  }, 20000);

  it('measures loudness consistently with the standalone integratedLufs function', () => {
    const spec = themes[0];
    if (!spec) throw new Error('expected at least one theme');
    const rendered = renderTheme(spec);
    expect(integratedLufs(rendered.pcm, rendered.sampleRate)).toBeCloseTo(rendered.loudnessLufs, 5);
  }, 10000);

  it('marks exactly the 3 proposed themes as pending founder approval', () => {
    const pending = themes.filter((t) => t.proposalPendingApproval).map((t) => t.guideId);
    expect(pending.sort()).toEqual(['ajo', 'paco', 'sardi']);
  });
});
