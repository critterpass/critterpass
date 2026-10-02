/**
 * The hatch waits for its block's size, then shows one image of it; where Skia has no raster
 * surface (here, Skia's Jest stand-in) it falls back to drawing the stripes live, never to nothing.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));

import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { hatchImageKey } from '../hatch-image';
import { Hatch } from '../hatch';

describe('hatch', () => {
  it('draws the stripes live once laid out where no raster surface exists', async () => {
    await render(<Hatch />);
    const block = screen.getByTestId('texture-hatch', { includeHiddenElements: true });
    await act(() =>
      fireEvent(block, 'layout', { nativeEvent: { layout: { width: 120, height: 14 } } }),
    );
    expect(screen.queryAllByTestId('skia-path', { includeHiddenElements: true })).toHaveLength(0);
    const canvas = screen.getByTestId('texture-hatch', { includeHiddenElements: true });
    await act(() =>
      fireEvent(canvas, 'layout', { nativeEvent: { layout: { width: 120, height: 14 } } }),
    );
    expect(
      screen.getAllByTestId('skia-path', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
  });

  it('caches one image per block size in whole device pixels', () => {
    const base = {
      angleDeg: 135,
      stripePt: 2,
      gapPt: 6,
      color: 'stripe',
      base: 'fill',
      scale: 2.625,
    };
    expect(hatchImageKey({ ...base, width: 120, height: 14 })).toBe(
      hatchImageKey({ ...base, width: 120.1, height: 14.05 }),
    );
    expect(hatchImageKey({ ...base, width: 120, height: 14 })).not.toBe(
      hatchImageKey({ ...base, width: 121, height: 14 }),
    );
  });
});
