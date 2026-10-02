/**
 * An icon is drawn once per size, colours, density and direction and shown as a plain image. A new
 * icon shows live (never blank) until its picture is drawn after the frame, then swaps to it; a new
 * colour (a theme, a pressed state) never shows the old picture, and the same icon again reuses its
 * image at once. Skia's raster surface is native, so it is stood in for at that boundary:
 * the stand-in's "PNG" names the pixel size, the colours and the transform it was drawn with.
 */
jest.mock('@shopify/react-native-skia', () => {
  const draws: string[] = [];
  const surface = (width: number, height: number) => {
    draws.push(`size:${width}x${height}`);
    return {
      getCanvas: () => ({
        translate: (x: number) => draws.push(`translate:${x}`),
        scale: (x: number) => draws.push(`scale:${x > 0 ? '+' : '-'}`),
        drawPath: (_path: unknown, paint: { color: string }) => draws.push(`fill:${paint.color}`),
      }),
      flush: () => undefined,
      makeImageSnapshot: () => ({
        encodeToBase64: () => {
          const picture = draws.join(';');
          draws.length = 0;
          return picture;
        },
      }),
    };
  };
  return {
    Skia: {
      Surface: { Make: surface },
      Path: { MakeFromSVGString: () => ({}) },
      Color: (color: string) => color,
      Paint: () => {
        const paint = {
          color: '',
          alpha: 1,
          setColor: (color: string) => (paint.color = color),
          getAlphaf: () => paint.alpha,
          setAlphaf: (alpha: number) => (paint.alpha = alpha),
          setAntiAlias: () => undefined,
          setBlendMode: () => undefined,
        };
        return paint;
      },
    },
    BlendMode: { Multiply: 'multiply' },
    Canvas: () => null,
    Group: () => null,
    Path: () => null,
  };
});

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react-native';

import { tokens } from '@cp/design-tokens';

import { renderUi } from '../../test-support/render';
import { Icon } from '../Icon';
import { resetIconImagesForTests } from '../icon-image';

/** Runs the queued icon draws (the tasks after the frame) and returns the picture now shown. */
async function drawQueued(): Promise<string | null> {
  await act(() => {
    jest.runOnlyPendingTimers();
  });
  return uriNow();
}

function uriNow(): string | null {
  const image = screen.queryByTestId('icon-image', { includeHiddenElements: true });
  return image === null ? null : (image.props as { source: { uri: string } }).source.uri;
}

// Every test starts with nothing drawn, and the after-the-frame draw runs only when the test says:
// on a slow runner a real timer can fire while the first render settles, which would show the
// picture in what the test checks as the first frame.
beforeEach(() => {
  resetIconImagesForTests();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('icon as an image', () => {
  it('draws the icon in its colour, and redraws at once when the colour changes', async () => {
    const pink = tokens.color.pink;
    const ink = tokens.color.paper.base;
    const view = await renderUi(<Icon name="bell" size={24} color={pink} decorative />);
    // First frame: the live icon, not a blank one; the picture follows.
    expect(uriNow()).toBeNull();
    const first = await drawQueued();
    expect(first).toContain(`fill:${pink}`);
    await view.rerender(<Icon name="bell" size={24} color={ink} decorative />);
    // Never the old colour while the new picture is drawn.
    expect(uriNow()).toBeNull();
    const second = await drawQueued();
    expect(second).toContain(`fill:${ink}`);
    expect(second).not.toContain(`fill:${pink}`);
    // Back to the first colour: the same picture as before, from the cache, in the same render.
    await view.rerender(<Icon name="bell" size={24} color={pink} decorative />);
    expect(uriNow()).toBe(first);
  });

  it('draws a new picture for a new size', async () => {
    await render(<Icon name="pin" size={24} color={tokens.color.pink} decorative />);
    const small = await drawQueued();
    expect(small).not.toBeNull();
    await screen.rerender(<Icon name="pin" size={40} color={tokens.color.pink} decorative />);
    const large = await drawQueued();
    expect(large).not.toBeNull();
    expect(large).not.toBe(small);
  });
});
