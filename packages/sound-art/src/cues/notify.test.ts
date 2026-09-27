import { describe, expect, it } from 'vitest';

import { dcOffset, peakAbs } from '../core/signal';
import { GUIDE_IDS } from '../music/registry';
import { renderNotify } from './notify';

describe('notify motifs', () => {
  it('renders a finite, DC-clean, <=2s motif for every guide', () => {
    for (const guideId of GUIDE_IDS) {
      const pcm = renderNotify(guideId);
      expect(pcm.length / 48000, `${guideId} duration`).toBeLessThanOrEqual(2);
      expect(
        pcm.every((v) => Number.isFinite(v)),
        `${guideId} finite`,
      ).toBe(true);
      expect(peakAbs(pcm), `${guideId} peak`).toBeLessThanOrEqual(1.001);
      expect(Math.abs(dcOffset(pcm)), `${guideId} DC offset`).toBeLessThan(0.02);
    }
  });

  it('is deterministic and distinct per guide', () => {
    const a = renderNotify('tokek');
    const b = renderNotify('tokek');
    expect(Array.from(a)).toEqual(Array.from(b));
    const other = renderNotify('paco');
    expect(a.length === other.length && Array.from(a).every((v, i) => v === other[i])).toBe(false);
  });
});
