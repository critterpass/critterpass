import path from 'node:path';
import { TextDecoder, TextEncoder } from 'node:util';

import { i18n } from '@lingui/core';
import { render, waitFor } from '@testing-library/react-native';
import type { SkiaEngine } from '@cp/critter-art/skia';
import CanvasKitInit from 'canvaskit-wasm';
import type { CanvasKit, EmbindEnumEntity } from 'canvaskit-wasm';
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import type * as ReactNativeModule from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

import { DiskLruCache, MemoryLruCache, StickerCache } from '../cache';
import type { StickerDiskFs } from '../cache';
import { tokens } from '@cp/design-tokens';

import { setUiQaSink } from '../../qa/ui-qa';
import { DEFAULT_STICKER_EDGE, resolveStickerEdge, Sticker } from '../Sticker';

// canvaskit-wasm's Emscripten glue decodes some internal strings as "utf-16le"; jest-expo's
// TextDecoder polyfill only supports UTF-8 (see export-png.test.ts for the same fix).
Object.assign(globalThis, { TextDecoder, TextEncoder });

const nodeRequire = require;

// A local double for `@shopify/react-native-skia` (same class as `app/__mocks__/mock-skia.tsx` —
// the native JSI/GPU host needed to run its real renderer isn't available under Jest — kept local
// rather than importing that shared double, which the `ui` layer may not depend on): `Canvas`/
// `Group` render children so RNTL can query the surrounding UI; `Picture`/`Image`/`Path` are leaf
// drawing primitives this test only needs to be present and inspectable via `testID`, not to draw
// real pixels — this test's `engine` prop injects a real canvaskit-wasm engine for the actual
// (non-drawing) Skia computation `<Sticker>` performs.
jest.mock('@shopify/react-native-skia', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot close over module-scope imports, only `mock`-prefixed ones
  const RN = require('react-native') as typeof ReactNativeModule;
  return {
    Canvas: ({ children }: { children?: React.ReactNode }) => <RN.View>{children}</RN.View>,
    Picture: () => <RN.View testID="live-picture" />,
    Image: () => <RN.Image testID="cached-image" source={{ uri: 'sticker' }} accessible={false} />,
  };
});

// A local double for `react-native-reanimated`'s `useFrameCallback` (same native-runtime-boundary
// class, see above): under Jest there is no UI runtime to fire per-frame callbacks, so this test
// drives frames itself by mutating `drawProgress.value` and calling RNTL's `rerender`.
jest.mock('react-native-reanimated', () => ({
  useFrameCallback: () => ({ setActive: () => {} }),
}));

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

function createFakeFs(): StickerDiskFs & { readonly files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    cacheDirectory: '/cache/',
    files,
    exists: (p) => Promise.resolve(files.has(p)),
    readBytes: (p) => Promise.resolve(files.get(p) ?? new Uint8Array()),
    writeBytes: (p, bytes) => {
      files.set(p, bytes);
      return Promise.resolve();
    },
    deleteFile: (p) => {
      files.delete(p);
      return Promise.resolve();
    },
    listFiles: (dir) =>
      Promise.resolve(
        [...files.keys()].filter((p) => p.startsWith(dir)).map((p) => p.slice(dir.length)),
      ),
    statFile: (p) => Promise.resolve({ size: files.get(p)?.byteLength ?? 0, modifiedMs: 0 }),
  };
}

/** `react-native-reanimated` is mocked (no native Worklets runtime under Jest — see mock-reanimated.tsx), so a plain mutable `{ value }` object stands in for a real `SharedValue`, matching the same test-double pattern used throughout this codebase for native-boundary types. */
function fakeSharedValue(initial: number): SharedValue<number> {
  return { value: initial } as unknown as SharedValue<number>;
}

let engine: SkiaEngine;

beforeAll(async () => {
  // `a11y.ts`'s labels use `@lingui/core/macro`'s standalone `t` (the global i18n instance, not a
  // React-context-bound one), so activating a locale here is enough — no `<I18nProvider>` needed.
  i18n.loadAndActivate({ locale: 'en', messages: {} });

  const wasmDir = path.dirname(nodeRequire.resolve('canvaskit-wasm/bin/canvaskit.js'));
  const canvasKit = await CanvasKitInit({ locateFile: (file: string) => path.join(wasmDir, file) });
  engine = createCanvasKitEngine(canvasKit);
});

describe('<Sticker>', () => {
  it('renders the static cached image and labels it "{name}, {form} form"', async () => {
    const cache = new StickerCache(
      new MemoryLruCache(1024 * 1024),
      new DiskLruCache(createFakeFs(), 1024 * 1024),
    );
    const { getByLabelText, findByTestId } = await render(
      <Sticker kind="gecko" name="Tokek" size={96} engine={engine} cache={cache} />,
    );
    expect(getByLabelText('Tokek, common form')).toBeTruthy();
    expect(await findByTestId('cached-image')).toBeTruthy();
  });

  it('writes to the cache only once drawProgress reaches 1 (0, 0.5, then 1)', async () => {
    const fs = createFakeFs();
    const cache = new StickerCache(
      new MemoryLruCache(1024 * 1024),
      new DiskLruCache(fs, 1024 * 1024),
    );
    const drawProgress = fakeSharedValue(0);
    const { rerender, findByTestId } = await render(
      <Sticker
        kind="gecko"
        name="Tokek"
        size={96}
        engine={engine}
        cache={cache}
        drawProgress={drawProgress}
      />,
    );
    expect(await findByTestId('live-picture')).toBeTruthy();
    expect(fs.files.size).toBe(0);

    drawProgress.value = 0.5;
    await rerender(
      <Sticker
        kind="gecko"
        name="Tokek"
        size={96}
        engine={engine}
        cache={cache}
        drawProgress={drawProgress}
      />,
    );
    expect(fs.files.size).toBe(0);

    drawProgress.value = 1;
    await rerender(
      <Sticker
        kind="gecko"
        name="Tokek"
        size={96}
        engine={engine}
        cache={cache}
        drawProgress={drawProgress}
      />,
    );
    await waitFor(() => expect(fs.files.size).toBeGreaterThan(0));
    expect(await findByTestId('cached-image')).toBeTruthy();
  });

  it('closedEyes renders under a different cache key than open eyes', async () => {
    const fs = createFakeFs();
    const cache = new StickerCache(
      new MemoryLruCache(1024 * 1024),
      new DiskLruCache(fs, 1024 * 1024),
    );
    await render(<Sticker kind="gecko" name="Tokek" size={96} engine={engine} cache={cache} />);
    await waitFor(() => expect(fs.files.size).toBe(1));

    await render(
      <Sticker kind="gecko" name="Tokek" size={96} closedEyes engine={engine} cache={cache} />,
    );
    await waitFor(() => expect(fs.files.size).toBe(2));
  });

  it('keeps the same outer box size whether showing the placeholder or the loaded image (no layout shift)', async () => {
    const cache = new StickerCache(
      new MemoryLruCache(1024 * 1024),
      new DiskLruCache(createFakeFs(), 1024 * 1024),
    );
    const { toJSON, findByTestId } = await render(
      <Sticker kind="gecko" name="Tokek" size={96} engine={engine} cache={cache} />,
    );
    const outerBefore = toJSON();
    await findByTestId('cached-image');
    const outerAfter = toJSON();
    const sizeOf = (node: ReturnType<typeof toJSON>): unknown =>
      Array.isArray(node) ? undefined : node?.props.style;
    expect(sizeOf(outerBefore)).toEqual({ width: 96, height: 96 });
    expect(sizeOf(outerAfter)).toEqual({ width: 96, height: 96 });
  });

  it('wears the paper sticker edge by default; masks and an explicit null stay bare', () => {
    expect(DEFAULT_STICKER_EDGE).toEqual({ color: tokens.color.paper.base });
    expect(resolveStickerEdge(undefined, undefined)).toBe(DEFAULT_STICKER_EDGE);
    expect(resolveStickerEdge(undefined, 'mask')).toBeNull();
    expect(resolveStickerEdge(null, undefined)).toBeNull();
    const gold = { color: tokens.color.yellow, w: 3 };
    expect(resolveStickerEdge(gold, undefined)).toBe(gold);
  });

  it('draws the edged and the bare art as different images and reports a bare critter', async () => {
    const reports: string[] = [];
    setUiQaSink((line) => reports.push(line));
    try {
      const fs = createFakeFs();
      const cache = new StickerCache(
        new MemoryLruCache(1024 * 1024),
        new DiskLruCache(fs, 1024 * 1024),
      );
      await render(<Sticker kind="gecko" name="Tokek" size={96} engine={engine} cache={cache} />);
      await waitFor(() => expect(fs.files.size).toBe(1));
      expect(reports).toEqual([]);

      await render(
        <Sticker
          kind="gecko"
          name="Tokek"
          size={96}
          sticker={null}
          engine={engine}
          cache={cache}
        />,
      );
      await waitFor(() => expect(fs.files.size).toBe(2));
      expect(reports).toEqual(['[ui-qa] STICKER_NO_OUTLINE "gecko:Tokek"']);

      await render(
        <Sticker
          kind="gecko"
          name="Tokek"
          size={96}
          variant="mask"
          maskColor={tokens.color.ink[600]}
          engine={engine}
          cache={cache}
        />,
      );
      expect(reports).toHaveLength(1);
    } finally {
      setUiQaSink(null);
    }
  });
});
