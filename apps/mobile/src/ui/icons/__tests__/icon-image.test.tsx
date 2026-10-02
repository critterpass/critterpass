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

import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react-native';

import { tokens } from '@cp/design-tokens';

import { renderUi } from '../../test-support/render';
import { Icon } from '../Icon';

async function shownUri(): Promise<string> {
  const image = await screen.findByTestId('icon-image', { includeHiddenElements: true });
  return (image.props as { source: { uri: string } }).source.uri;
}

function uriNow(): string | null {
  const image = screen.queryByTestId('icon-image', { includeHiddenElements: true });
  return image === null ? null : (image.props as { source: { uri: string } }).source.uri;
}

describe('icon as an image', () => {
  it('draws the icon in its colour, and redraws at once when the colour changes', async () => {
    const pink = tokens.color.pink;
    const ink = tokens.color.paper.base;
    const view = await renderUi(<Icon name="bell" size={24} color={pink} decorative />);
    // First frame: the live icon, not a blank one; the picture follows.
    expect(uriNow()).toBeNull();
    const first = await shownUri();
    expect(first).toContain(`fill:${pink}`);
    await view.rerender(<Icon name="bell" size={24} color={ink} decorative />);
    // Never the old colour while the new picture is drawn.
    expect(uriNow()).toBeNull();
    await waitFor(() => expect(uriNow()).toContain(`fill:${ink}`));
    expect(uriNow()).not.toContain(`fill:${pink}`);
    // Back to the first colour: the same picture as before, from the cache, in the same render.
    await view.rerender(<Icon name="bell" size={24} color={pink} decorative />);
    expect(uriNow()).toBe(first);
  });

  it('draws a new picture for a new size', async () => {
    await render(<Icon name="pin" size={24} color={tokens.color.pink} decorative />);
    const small = await shownUri();
    await screen.rerender(<Icon name="pin" size={40} color={tokens.color.pink} decorative />);
    await waitFor(() => expect(uriNow()).not.toBeNull());
    expect(uriNow()).not.toBe(small);
  });
});
