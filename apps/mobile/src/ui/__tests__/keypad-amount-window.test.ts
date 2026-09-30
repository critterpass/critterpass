import { describe, expect, it } from '@jest/globals';

import { digitWindow } from '../inputs/KeypadAmount';
import { FACE_METRICS, glyphRoomStyle, lineBoxEm } from '../text/glyph-room';
import type { LineLayout } from '../text/glyph-room';

const PROBE_OFFSET = 400;
const FONT_SIZE = 80;
const archivo = FACE_METRICS.Archivo!;

/** The probe as the platform lays it: a display line under `PROBE_OFFSET` of padding. */
function probe(multiplier: number, layout: LineLayout) {
  const box = lineBoxEm('Archivo', multiplier, layout);
  const room = box.room * FONT_SIZE;
  const shift = box.shift * FONT_SIZE;
  const line = multiplier * FONT_SIZE;
  const style = glyphRoomStyle({ room, shift }, undefined) ?? {};
  const marginTop = Number(style.marginTop ?? 0);
  const paddingTop = Number(style.paddingTop ?? 0);
  const marginBottom = Number(style.marginBottom ?? 0);
  return {
    line,
    marginTop,
    paddingTop,
    frameHeight: PROBE_OFFSET + marginTop + paddingTop + line + marginBottom,
    textY: PROBE_OFFSET + marginTop,
  };
}

describe('keypad amount digit window', () => {
  it.each<[LineLayout, number]>([
    ['ios', 0.82],
    ['centred', 0.82],
    ['ios', 1.2],
    ['centred', 1.2],
  ])(
    '%s at %s leading: digits sit where a static line puts them, with no room kept',
    (layout, multiplier) => {
      const laid = probe(multiplier, layout);
      const window = digitWindow(laid);
      // The window is one slot of the line: no glyph room above it, no iOS shift below it.
      expect(window.slot).toBeCloseTo(laid.line, 6);
      // In its cell the text's box starts at the cell's top, so it is never pulled above its parent.
      expect(window.lift + laid.marginTop).toBeCloseTo(0, 6);
      // Its line lands in the window where a static line lands in its slot (the centred face).
      const lineTop = -window.lift + window.lift + laid.marginTop + laid.paddingTop;
      const centredBaseline =
        ((multiplier - archivo.ascent - archivo.descent) / 2 + archivo.ascent) * FONT_SIZE;
      const staticLineTop = lineBoxEm('Archivo', multiplier, layout).shift * FONT_SIZE;
      expect(lineTop).toBeCloseTo(staticLineTop, 6);
      // A numeral (cap height) shows whole inside the window, on both platforms.
      const baseline = lineTop + centredBaseline - staticLineTop;
      expect(baseline - archivo.capHeight * FONT_SIZE).toBeGreaterThanOrEqual(0);
      expect(baseline).toBeLessThanOrEqual(window.slot);
      // One rolling cell holds the text's box above its slot.
      expect(window.pitch).toBeCloseTo(window.slot + window.lift, 6);
    },
  );
});
