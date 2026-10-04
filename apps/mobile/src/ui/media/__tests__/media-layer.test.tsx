// Skia's native renderer and the device file system do not exist under Jest; see the doubles.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../test-support/media-skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('expo-file-system', () => require('../test-support/memory-file-system'));

import { tokens } from '@cp/design-tokens';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';

import type { MediaView } from '@/lib/media/variants';

import { renderUi } from '../../test-support/render';
import { duotoneMatrix, treatmentFor } from '../duotone';
import { creditFor, MediaLayer } from '../MediaLayer';
import { downloads, reset, seed } from '../test-support/memory-file-system';

const PINK = tokens.color.pink;
const YELLOW = tokens.color.yellow;
const INK = tokens.color.ink['850'];
const ID = '0199a000-0000-7000-8000-00000000000a';
const BASE = `https://media.staging.critterpass.app/c/media/${ID}`;

const photo: MediaView = {
  id: ID,
  kind: 'photo',
  blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
  images: [480, 828, 1242, 1656].map((w) => ({ url: `${BASE}/${w}.webp`, w, h: (w * 2) / 3 })),
  videos: [],
  credit: 'Photo: Someone · Pexels',
  attribution_required: false,
};

async function layout(width: number, height: number) {
  await fireEvent(screen.getByTestId('hero-media', { includeHiddenElements: true }), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
  });
}

const images = () =>
  screen
    .queryAllByTestId('skia-image', { includeHiddenElements: true })
    .map((node) => (node.props as { skiaProps: { image: Record<string, unknown> } }).skiaProps);

beforeEach(() => reset());

describe('MediaLayer', () => {
  it('draws nothing without an asset, leaving the flat colour', async () => {
    await renderUi(<MediaLayer media={null} surface="accent" accent={PINK} testID="hero-media" />);
    expect(screen.queryByTestId('hero-media', { includeHiddenElements: true })).toBeNull();
  });

  it('draws the blurhash and the photo as a duotone of the accent', async () => {
    await renderUi(<MediaLayer media={photo} surface="accent" accent={PINK} testID="hero-media" />);
    await layout(390, 180);
    const drawn = images();
    expect(drawn).toHaveLength(2);
    expect(drawn[0]?.image).toEqual({
      placeholder: { width: 32, height: 20, colorType: 4, alphaType: 3 },
    });
    // 390 pt at the test's pixel ratio picks the smallest still that covers it.
    expect(drawn[1]?.image).toEqual({ uri: expect.stringMatching(/\/(480|828|1242)\.webp$/u) });
    const t = treatmentFor('accent', PINK, INK);
    const matrices = screen
      .queryAllByTestId('skia-color-matrix', { includeHiddenElements: true })
      .map((node) => (node.props as { skiaProps: { matrix: number[] } }).skiaProps.matrix);
    expect(matrices).toEqual([
      duotoneMatrix(t.shadow, t.highlight),
      duotoneMatrix(t.shadow, t.highlight),
    ]);
  });

  it('prefers a copy saved on the device, so the hero draws offline', async () => {
    seed(`file:///docs/media/${ID}/1242.webp`);
    await renderUi(<MediaLayer media={photo} surface="accent" accent={PINK} testID="hero-media" />);
    await layout(390, 180);
    expect(images()[1]?.image).toEqual({ uri: `file:///docs/media/${ID}/1242.webp` });
    expect(downloads).toEqual([]);
  });

  it('saves the still it shows for next time', async () => {
    await renderUi(<MediaLayer media={photo} surface="dark" accent={YELLOW} testID="hero-media" />);
    await layout(390, 180);
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatch(/\.webp$/u);
  });

  it('loads a smaller still on low data', async () => {
    await renderUi(
      <MediaLayer media={photo} surface="accent" accent={PINK} lowData testID="hero-media" />,
    );
    await layout(390, 180);
    const normal = images()[1]?.image['uri'] as string;
    expect(Number(/(\d+)\.webp$/u.exec(normal)?.[1])).toBeLessThanOrEqual(828);
  });

  it('shows a video as its poster where no loop player exists', async () => {
    const video: MediaView = {
      ...photo,
      kind: 'video',
      videos: [{ url: `${BASE}/720.mp4`, w: 720, h: 406, bytes: 900_000 }],
    };
    await renderUi(
      <MediaLayer media={video} surface="dark" accent={YELLOW} motion="loop" testID="hero-media" />,
    );
    await layout(390, 180);
    expect(images()[1]?.image['uri']).toMatch(/\.webp$/u);
  });

  it('shows the credit line only when the licence requires it', async () => {
    const { rerender } = await renderUi(
      <MediaLayer media={photo} surface="accent" accent={PINK} testID="hero-media" />,
    );
    expect(screen.queryByTestId('hero-media-credit')).toBeNull();
    const commons: MediaView = {
      ...photo,
      attribution_required: true,
      credit: 'Someone · CC BY-SA 4.0 · Wikimedia Commons',
    };
    await rerender(
      <MediaLayer media={commons} surface="accent" accent={PINK} testID="hero-media" />,
    );
    expect(screen.getByTestId('hero-media-credit')).toHaveTextContent(
      'Someone · CC BY-SA 4.0 · Wikimedia Commons',
    );
  });
  it("draws a small card's photo in its own colours, with no duotone", async () => {
    await renderUi(
      <MediaLayer media={photo} surface="dark" accent={YELLOW} tone="colour" testID="hero-media" />,
    );
    await layout(136, 76);
    expect(images()).toHaveLength(2);
    expect(
      screen.queryAllByTestId('skia-color-matrix', { includeHiddenElements: true }),
    ).toHaveLength(0);
  });

  it('shows the author alone where the whole credit does not fit the line', async () => {
    const commons: MediaView = {
      ...photo,
      attribution_required: true,
      credit: 'Chainwit. · CC BY 4.0 · Wikimedia Commons',
    };
    await renderUi(
      <MediaLayer
        media={commons}
        surface="dark"
        accent={YELLOW}
        tone="colour"
        testID="hero-media"
      />,
    );
    await layout(136, 76);
    expect(screen.getByTestId('hero-media-credit')).toHaveTextContent('Chainwit.', { exact: true });
    await layout(390, 180);
    expect(screen.getByTestId('hero-media-credit')).toHaveTextContent(
      'Chainwit. · CC BY 4.0 · Wikimedia Commons',
    );
    expect(creditFor('Photo: Someone · Pexels', 60)).toBe('Photo: Someone');
  });
});

jest.setTimeout(60_000);
