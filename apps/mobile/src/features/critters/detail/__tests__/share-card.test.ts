/**
 * The critter card's text is mockDrawn in the app's bundled faces read from the font assets, never
 * through the system font manager: on Android that manager does not know the bundled faces and
 * the name and line came out blank. Skia is native, so a recording stand-in takes its place here.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { renderCritterCard } from '../share-card';

interface MockDrawnText {
  readonly text: string;
  readonly face: unknown;
  readonly size: number;
}

const mockDrawn: MockDrawnText[] = [];
const mockSystemFontManager = jest.fn();

jest.mock('@shopify/react-native-skia', () => {
  const paint = () => ({ setColor: () => undefined });
  const surface = {
    getCanvas: () => ({
      drawRect: () => undefined,
      drawImageRect: () => undefined,
      drawText: (text: string, _x: number, _y: number, _paint: unknown, font: MockDrawnText) => {
        mockDrawn.push({ text, face: font.face, size: font.size });
      },
    }),
    flush: () => undefined,
    makeImageSnapshot: () => ({ encodeToBytes: () => new Uint8Array([1, 2, 3]) }),
  };
  return {
    Skia: {
      Surface: { MakeOffscreen: () => surface, Make: () => surface },
      Paint: paint,
      Color: (c: string) => c,
      XYWHRect: () => ({}),
      Font: (face: unknown, size: number) => ({
        face,
        size,
        measureText: (text: string) => ({ width: text.length * size * 0.5 }),
      }),
      FontMgr: { System: () => mockSystemFontManager() },
    },
  };
});

jest.mock('@/ui/share-image/bundled-typefaces', () => ({
  bundledTypeface: (face: string) => Promise.resolve({ bundled: face }),
}));

jest.mock('@/ui/sticker/export-png', () => ({
  renderStickerImage: () => ({ width: () => 520, height: () => 520 }),
}));

jest.mock('@/ui/sticker/Sticker', () => ({ getDefaultSkiaEngine: () => ({}) }));

const CARD = {
  kind: 'langur',
  seed: 3,
  form: null,
  name: 'Chà Vá',
  line: 'Common · found in Đà Nẵng',
};

beforeEach(() => {
  mockDrawn.length = 0;
  mockSystemFontManager.mockClear();
});

describe('the critter share card', () => {
  it.each(['post', 'story'] as const)('draws its %s text in the bundled faces', async (format) => {
    const bytes = await renderCritterCard(CARD, format);
    expect(bytes).toHaveLength(3);
    expect(mockDrawn).toEqual([
      { text: 'CHÀ VÁ', face: { bundled: 'Archivo-W100-900' }, size: 88 },
      { text: 'Common · found in Đà Nẵng', face: { bundled: 'Geist-600' }, size: 40 },
    ]);
    expect(mockSystemFontManager).not.toHaveBeenCalled();
  });
});
