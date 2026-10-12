/** Screenshots and synthetic screens the screen-check suites judge. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { decodePng, type RgbaImage } from './png';
import type { Rgb } from './screen-checks';
import { appBackground } from './screen-scan';

// Founder device screenshots and one CI simulator capture (downscaled; reviewer marks painted out
// where they crossed an edge).
export const FIXTURES = path.join(import.meta.dirname, '__fixtures__/screens');
export const load = (name: string) => decodePng(readFileSync(path.join(FIXTURES, `${name}.png`)));
export const BG = appBackground();

export function blank(width: number, height: number, colour: Rgb): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) data.set([...colour, 255], i * 4);
  return { width, height, data };
}

export function paint(
  image: RgbaImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: Rgb,
): void {
  for (let y = Math.round(y0); y < Math.round(y1); y += 1)
    for (let x = Math.round(x0); x < Math.round(x1); x += 1)
      image.data.set([...c], (y * image.width + x) * 4);
}

export function copy(image: RgbaImage): RgbaImage {
  return { ...image, data: new Uint8Array(image.data) };
}

/** A synthetic screen: text-like lines down the whole height on the app background. */
export function busyScreen(): RgbaImage {
  const image = blank(400, 860, BG);
  for (let y = 80; y < 820; y += 24) paint(image, 30, y, 300, y + 12, [240, 235, 220]);
  return image;
}
