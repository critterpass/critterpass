import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

import { i18n } from '@lingui/core';
import { render } from '@testing-library/react-native';
import type { SkiaEngine } from '@cp/critter-art/skia';
import { tokens } from '@cp/design-tokens';
import CanvasKitInit from 'canvaskit-wasm';
import type { CanvasKit, EmbindEnumEntity } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import type * as ReactNativeModule from 'react-native';

import { DiskLruCache, MemoryLruCache, StickerCache } from '../cache';
import type { StickerDiskFs } from '../cache';
import { SilhouetteSlot } from '../SilhouetteSlot';

// Same local Skia double as Sticker.test.tsx — see that file's comment for why it stays local
// rather than importing `app/__mocks__/mock-skia` from a route-layer directory.
jest.mock('@shopify/react-native-skia', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot close over module-scope imports, only `mock`-prefixed ones
  const RN = require('react-native') as typeof ReactNativeModule;
  return {
    Canvas: ({ children }: { children?: React.ReactNode }) => <RN.View>{children}</RN.View>,
    Picture: () => <RN.View testID="live-picture" />,
    Image: () => <RN.Image testID="cached-image" source={{ uri: 'sticker' }} accessible={false} />,
  };
});
jest.mock('react-native-reanimated', () => ({
  useFrameCallback: () => ({ setActive: () => {} }),
}));

// canvaskit-wasm's Emscripten glue decodes some internal strings as "utf-16le"; jest-expo's
// TextDecoder polyfill only supports UTF-8 (see export-png.test.ts for the same fix).
Object.assign(globalThis, { TextDecoder, TextEncoder });

const nodeRequire = require;

function wrapPaint(ck: CanvasKit) {
  const paint = new ck.Paint();
  const paintStyles = [ck.PaintStyle.Fill, ck.PaintStyle.Stroke];
  const strokeCaps = [ck.StrokeCap.Butt, ck.StrokeCap.Round];
  const strokeJoins = [ck.StrokeJoin.Miter, ck.StrokeJoin.Round];
  const blendModes = new Map<number, EmbindEnumEntity>([
    [3, ck.BlendMode.SrcOver],
    [24, ck.BlendMode.Multiply],
  ]);
  const realSetStyle = paint.setStyle.bind(paint);
  const realSetBlendMode = paint.setBlendMode.bind(paint);
  const realSetStrokeCap = paint.setStrokeCap.bind(paint);
  const realSetStrokeJoin = paint.setStrokeJoin.bind(paint);
  Object.assign(paint, {
    setStyle: (v: number) => realSetStyle(paintStyles[v] ?? ck.PaintStyle.Fill),
    setBlendMode: (v: number) => realSetBlendMode(blendModes.get(v) ?? ck.BlendMode.SrcOver),
    setStrokeCap: (v: number) => realSetStrokeCap(strokeCaps[v] ?? ck.StrokeCap.Butt),
    setStrokeJoin: (v: number) => realSetStrokeJoin(strokeJoins[v] ?? ck.StrokeJoin.Miter),
  });
  return paint;
}

function wrapPictureRecorder(ck: CanvasKit) {
  const recorder = new ck.PictureRecorder();
  const bounds = ck.LTRBRect(0, 0, 4096, 4096);
  const realBeginRecording = recorder.beginRecording.bind(recorder);
  Object.assign(recorder, { beginRecording: () => realBeginRecording(bounds) });
  return recorder;
}

function createCanvasKitEngine(ck: CanvasKit): SkiaEngine {
  return {
    Path: {
      MakeFromCmds: (cmds: number[][]) =>
        ck.Path.MakeFromCmds(cmds.flat()) as unknown as ReturnType<
          SkiaEngine['Path']['MakeFromCmds']
        >,
    },
    Paint: () => wrapPaint(ck) as unknown as ReturnType<SkiaEngine['Paint']>,
    PictureRecorder: () =>
      wrapPictureRecorder(ck) as unknown as ReturnType<SkiaEngine['PictureRecorder']>,
    Surface: {
      MakeOffscreen: (w: number, h: number) =>
        ck.MakeSurface(w, h) as unknown as ReturnType<SkiaEngine['Surface']['MakeOffscreen']>,
    },
    ImageFilter: {
      MakeDropShadow: (dx, dy, sigmaX, sigmaY, color) =>
        ck.ImageFilter.MakeDropShadow(dx, dy, sigmaX, sigmaY, color, null) as unknown as ReturnType<
          SkiaEngine['ImageFilter']['MakeDropShadow']
        >,
    },
    Color: (color: string) => ck.parseColorString(color),
    Image: {
      MakeImageFromEncoded: (bytes: Uint8Array) =>
        ck.MakeImageFromEncoded(bytes) as unknown as ReturnType<
          SkiaEngine['Image']['MakeImageFromEncoded']
        >,
    },
  };
}

function createFakeCache(): StickerCache {
  const fs: StickerDiskFs = {
    cacheDirectory: '/cache/',
    exists: () => Promise.resolve(false),
    readBytes: () => Promise.reject(new Error('not found')),
    writeBytes: () => Promise.resolve(),
    deleteFile: () => Promise.resolve(),
    listFiles: () => Promise.resolve([]),
    statFile: () => Promise.reject(new Error('not found')),
  };
  return new StickerCache(new MemoryLruCache(1024 * 1024), new DiskLruCache(fs, 1024 * 1024));
}

let engine: SkiaEngine;

beforeAll(async () => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const wasmDir = path.dirname(nodeRequire.resolve('canvaskit-wasm/bin/canvaskit.js'));
  const canvasKit = await CanvasKitInit({ locateFile: (file: string) => path.join(wasmDir, file) });
  engine = createCanvasKitEngine(canvasKit);
});

describe('<SilhouetteSlot>', () => {
  it('labels the slot "Undiscovered local, found by being in {city}" and shows a "?" glyph in tier colour', async () => {
    const { getByLabelText, findByText } = await render(
      <SilhouetteSlot
        kind="gecko"
        city="Bali"
        size={96}
        maskColor={tokens.tier.locked.default}
        glyphColor={tokens.tier.legendary.color}
        engine={engine}
        cache={createFakeCache()}
      />,
    );
    expect(getByLabelText('Undiscovered local, found by being in Bali')).toBeTruthy();
    const glyph = await findByText('?');
    expect(glyph.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: tokens.tier.legendary.color })]),
    );
  });

  it('hides the inner sticker from the accessibility tree (the outer label is the whole story)', async () => {
    const { getByLabelText } = await render(
      <SilhouetteSlot
        kind="gecko"
        city="Bali"
        size={96}
        maskColor={tokens.tier.locked.default}
        glyphColor={tokens.tier.legendary.color}
        engine={engine}
        cache={createFakeCache()}
      />,
    );
    const outer = getByLabelText('Undiscovered local, found by being in Bali');
    // The hidden wrapper around <Sticker> is the first child; it must not carry its own a11y node.
    const hiddenWrapper = outer.children[0] as { props: { accessibilityElementsHidden?: boolean } };
    expect(hiddenWrapper.props.accessibilityElementsHidden).toBe(true);
  });
});
