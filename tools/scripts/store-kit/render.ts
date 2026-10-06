/**
 * Rendering for the store and social kits: the brand fonts, text measuring and the share layout
 * renderer, all on one copy of the native canvas. The canvas is the share renderer's dependency
 * (`@cp/critter-art`), and fonts are registered per copy, so it is loaded from there: a second
 * copy would measure captions in a fallback font.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// The art package's entry point first: its kinds register in an order a deep import skips.
import '../../../packages/critter-art/src/index';
import {
  registerFonts,
  renderCardNode,
} from '../../../packages/critter-art/src/share/backend-node';
import type { CardLayout } from '../../../packages/critter-art/src/share/model';
import { decodePng } from '../ci-device/png';
import type { MeasureAt } from './fit-text';
import { encodeRgbPng } from './png';

interface Context2d {
  font: string;
  imageSmoothingQuality: string;
  measureText(text: string): { readonly width: number };
  drawImage(image: unknown, x: number, y: number, w: number, h: number): void;
}
interface CanvasModule {
  createCanvas(
    width: number,
    height: number,
  ): { getContext(kind: '2d'): Context2d; encode(format: 'png'): Promise<Uint8Array> };
  loadImage(source: Uint8Array): Promise<unknown>;
}

const artRequire = createRequire(
  new URL('../../../packages/critter-art/package.json', import.meta.url),
);
const canvasModule = artRequire('@napi-rs/canvas') as CanvasModule;

export const HEADLINE_FONT = { family: 'KitHeadline', weight: 900, file: 'Archivo-W66-900.ttf' };
export const BODY_FONT = { family: 'KitBody', weight: 500, file: 'Geist-500.ttf' };
export const MONO_FONT = { family: 'KitMono', weight: 500, file: 'GeistMono-500.ttf' };
export type KitFont = typeof HEADLINE_FONT;

let fontsLoaded = false;

/** Registers the brand fonts once per process (the app's own font files). */
export function loadKitFonts(): void {
  if (fontsLoaded) return;
  registerFonts(
    [HEADLINE_FONT, BODY_FONT, MONO_FONT].map((font) => ({
      family: font.family,
      bytes: readFileSync(
        new URL(`../../../apps/mobile/assets/fonts/${font.file}`, import.meta.url),
      ),
    })),
  );
  fontsLoaded = true;
}

/** Measures text the way the renderer will draw it in `font`. */
export function measurer(font: KitFont): MeasureAt {
  loadKitFonts();
  const context = canvasModule.createCanvas(8, 8).getContext('2d');
  return (text, fontSize) => {
    context.font = `${String(font.weight)} ${String(fontSize)}px "${font.family}"`;
    return context.measureText(text).width;
  };
}

/** Renders a layout to an RGB PNG with no alpha channel, the form both stores take. */
export async function renderOpaquePng(layout: CardLayout): Promise<Buffer> {
  loadKitFonts();
  const image = decodePng(Buffer.from(await renderCardNode(layout)));
  return encodeRgbPng(image.width, image.height, image.data);
}

/** Renders a layout as it is, alpha included (an overlay with a transparent background). */
export async function renderLayoutPng(layout: CardLayout): Promise<Uint8Array> {
  loadKitFonts();
  return renderCardNode(layout);
}

/** Scales a square PNG to `size` pixels a side, keeping its alpha. */
export async function resizeSquarePng(file: Uint8Array, size: number): Promise<Uint8Array> {
  const canvas = canvasModule.createCanvas(size, size);
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(await canvasModule.loadImage(file), 0, 0, size, size);
  return canvas.encode('png');
}
