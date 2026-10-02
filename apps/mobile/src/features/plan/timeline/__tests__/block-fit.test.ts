import { describe, expect, it } from '@jest/globals';

import { blockFit, FACE_PAD, FACE_PAD_TIGHT } from '../block-fit';

// Line heights as the app's fonts set them: a title line and a meta line.
const TITLE = 22;
const META = 18;
const lines = { titleHeight: TITLE, metaHeight: META, hasMeta: true };

describe('timeline block fit', () => {
  it('keeps the full padding and the meta line when both fit', () => {
    expect(blockFit({ ...lines, height: 90 })).toEqual({ padding: FACE_PAD, showMeta: true });
  });

  it('tightens the padding before it leaves the meta line out', () => {
    // 48 - 4 = 44 for the face: 8 + 40 of words do not fit, 4 + 40 do.
    expect(blockFit({ ...lines, height: 48 })).toEqual({ padding: FACE_PAD_TIGHT, showMeta: true });
  });

  it('leaves the meta line out rather than cutting it, title whole at the top', () => {
    expect(blockFit({ ...lines, height: 42 })).toEqual({ padding: FACE_PAD, showMeta: false });
  });

  it('tightens the padding when even the title alone would be cut', () => {
    // A taller title line (stacked marks): 8 + 28 > 30, 4 + 28 fits.
    expect(blockFit({ ...lines, titleHeight: 28, height: 34 })).toEqual({
      padding: FACE_PAD_TIGHT,
      showMeta: false,
    });
  });

  it('shows the title only on short blocks or without meta', () => {
    expect(blockFit({ ...lines, height: 36 }).showMeta).toBe(false);
    expect(blockFit({ ...lines, hasMeta: false, height: 90 }).showMeta).toBe(false);
  });

  it('follows the height alone once lines are measured, so a moved block refits', () => {
    const tall = blockFit({ ...lines, titleHeight: 28, height: 120 });
    const short = blockFit({ ...lines, titleHeight: 28, height: 34 });
    expect(tall).toEqual({ padding: FACE_PAD, showMeta: true });
    expect(short.padding).toBe(FACE_PAD_TIGHT);
  });
});
