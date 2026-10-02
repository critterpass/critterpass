import { describe, expect, it } from 'vitest';

import { countSkiaSurfaces, iconEncodeCost } from './encode-totals';

describe('countSkiaSurfaces', () => {
  it('counts the Skia surfaces a flow created and released, and nothing else', () => {
    const log = [
      '10-02 08:11:32.849  5738  5738 I SkiaTextureView: onSurfaceTextureAvailable: 89x90',
      '10-02 08:11:32.853  5738  5738 I SkiaTextureView: onSurfaceTextureAvailable: 63x63',
      '10-02 08:11:40.001  5738  5738 I SkiaTextureView: onSurfaceTextureDestroyed',
      '10-02 08:11:41.002  5738  5738 I RNSkia  : updateAndRelease() failed.',
      '',
    ].join('\n');
    expect(countSkiaSurfaces(log)).toEqual({
      created: 2,
      destroyed: 1,
      sizes: { '89x90': 1, '63x63': 1 },
    });
    expect(countSkiaSurfaces('')).toEqual({ created: 0, destroyed: 0, sizes: {} });
  });
});

describe('iconEncodeCost', () => {
  it('sums the icon encodes per flow and finds the busiest second', () => {
    const log = [
      '  1790950000.120  5738  5764 I ReactNativeJS: [icon-encode] 2.50',
      '  1790950000.400  5738  5764 I ReactNativeJS: [icon-encode] 4.00',
      '  1790950003.010  5738  5764 I ReactNativeJS: [icon-encode] 1.25',
      '  1790950003.020  5738  5764 I ReactNativeJS: [ui-qa] TEXT_TRUNCATED "x"',
    ].join('\n');
    expect(iconEncodeCost(log)).toEqual({
      count: 3,
      totalMs: 7.8,
      busiestSecondMs: 6.5,
      slowestMs: 4,
    });
    expect(iconEncodeCost(log, 'sticker').count).toBe(0);
    expect(
      iconEncodeCost('  1790950000.120  1  1 I ReactNativeJS: [sticker-encode] 3.00', 'sticker'),
    ).toEqual({ count: 1, totalMs: 3, busiestSecondMs: 3, slowestMs: 3 });
    expect(iconEncodeCost('')).toEqual({ count: 0, totalMs: 0, busiestSecondMs: 0, slowestMs: 0 });
  });
});
