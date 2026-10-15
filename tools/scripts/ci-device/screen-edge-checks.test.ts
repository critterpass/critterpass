import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { findCardAtEdge, findShadowCut } from './screen-edge-checks';
import { keyboardTop, type Rgb } from './screen-checks';
import { blank, copy, FIXTURES, load, paint } from './screen-test-images';

const GROUND: Rgb = [245, 245, 247];
const CARD: Rgb = [255, 255, 255];

/** A light page with a card, set `inset` px in from both sides, its corners rounded by `r`. */
function cardOnPage(inset: number, r: number): ReturnType<typeof blank> {
  const image = blank(393, 852, GROUND);
  const [x0, x1, y0, y1] = [inset, 393 - inset, 200, 330];
  paint(image, x0, y0, x1, y1, CARD);
  for (let k = 0; k < r; k += 1) {
    // A stepped quarter circle at each corner: the ground shows in the corners.
    const cut = Math.round(r - Math.sqrt(r * r - (r - k) * (r - k)));
    paint(image, x0, y0 + k, x0 + cut, y0 + k + 1, GROUND);
    paint(image, x1 - cut, y0 + k, x1, y0 + k + 1, GROUND);
    paint(image, x0, y1 - k - 1, x0 + cut, y1 - k, GROUND);
    paint(image, x1 - cut, y1 - k - 1, x1, y1 - k, GROUND);
  }
  return image;
}

/** A chip with a soft shadow under it that a box clips flat `cut` px under the chip. */
function chipShadow(cut: number | null): ReturnType<typeof blank> {
  const image = blank(393, 852, GROUND);
  paint(image, 40, 300, 160, 336, CARD);
  for (let dy = 0; dy < 20; dy += 1) {
    if (cut !== null && dy >= cut) break;
    for (let x = 30; x < 170; x += 1) {
      // Darkest under the chip's middle, fading out down and to both sides.
      const along = Math.max(0, 1 - Math.abs(x - 100) / 70);
      const shade = Math.round(12 * along * (1 - dy / 20));
      paint(image, x, 336 + dy, x + 1, 337 + dy, [245 - shade, 245 - shade, 247 - shade]);
    }
  }
  return image;
}

describe('edge screen checks', { timeout: 60_000 }, () => {
  describe('SHADOW_CUT', () => {
    it('finds the shadows the founder found cut flat: the hub Today pill and the Crew plans chips', () => {
      expect(findShadowCut(load('shadow-cut-today-pill'))?.detail).toContain('y=308');
      expect(findShadowCut(load('shadow-cut-crew-plans-chips'))?.detail).toContain('y=313');
    });

    it('finds the guide chat starter chip cut by its row in an older founder screenshot', () => {
      expect(findShadowCut(load('sheet-gap-guide-chat'))?.code).toBe('SHADOW_CUT');
    });

    it('passes a shadow that fades out, and finds the same shadow clipped', () => {
      expect(findShadowCut(chipShadow(null))).toBeNull();
      expect(findShadowCut(chipShadow(10))?.code).toBe('SHADOW_CUT');
    });

    it('passes a flat band that ends in a straight line: a header, a pill edge', () => {
      const band = blank(393, 852, GROUND);
      paint(band, 0, 100, 393, 180, [236, 236, 238]);
      paint(band, 120, 400, 220, 430, [230, 230, 232]);
      expect(findShadowCut(band)).toBeNull();
    });
  });

  describe('CARD_AT_EDGE', () => {
    it('finds the Offline card the founder found running edge to edge', () => {
      const offline = load('card-at-edge-offline');
      expect(findCardAtEdge(offline)?.detail).toContain('0px from the screen');
    });

    it('finds a rounded card against the edge, and not the card with its gutter or a square band', () => {
      expect(findCardAtEdge(cardOnPage(0, 12))?.code).toBe('CARD_AT_EDGE');
      expect(findCardAtEdge(cardOnPage(16, 12))).toBeNull();
      expect(findCardAtEdge(cardOnPage(0, 0))).toBeNull();
    });

    it('passes a sheet: its top corners rounded at the edge, running to the bottom', () => {
      const sheet = copy(cardOnPage(0, 12));
      paint(sheet, 0, 318, 393, 852, CARD);
      expect(findCardAtEdge(sheet)).toBeNull();
    });
  });

  it('finds nothing else on the founder and simulator screens', () => {
    const flagged = new Set(['shadow-cut-today-pill', 'shadow-cut-crew-plans-chips']);
    for (const file of readdirSync(FIXTURES).filter((name) => name.endsWith('.png'))) {
      const name = file.slice(0, -'.png'.length);
      const image = load(name);
      const shadow =
        flagged.has(name) || name === 'sheet-gap-guide-chat' ? null : findShadowCut(image);
      const card =
        name === 'card-at-edge-offline'
          ? null
          : findCardAtEdge(image, keyboardTop(image) ?? image.height);
      expect({ name, shadow, card }).toEqual({ name, shadow: null, card: null });
    }
  });
});
