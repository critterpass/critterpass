import { describe, expect, it } from '@jest/globals';

import { LAB_ITEMS } from '../../day/dev/lab-fixtures';
import { blockFit, FACE_PAD, FACE_PAD_TIGHT, FRAME_PAD } from '../block-fit';
import { buildTimeline } from '../timeline-model';

// Line heights as the app's fonts set them: a title line and a meta line.
const TITLE = 22;
const META = 18;
const lines = { titleHeight: TITLE, metaHeight: META, hasMeta: true };

describe('timeline block fit', () => {
  it('keeps the full padding and the meta line when both fit', () => {
    expect(blockFit({ ...lines, height: 90 })).toEqual({ padding: FACE_PAD, showMeta: true });
  });

  it('tightens the padding before it leaves the meta line out', () => {
    // 52 - 4 = 48 for the face: 16 + 40 of words do not fit, 8 + 40 do.
    expect(blockFit({ ...lines, height: 52 })).toEqual({ padding: FACE_PAD_TIGHT, showMeta: true });
  });

  it('leaves the meta line out rather than cutting it, title whole at the top', () => {
    // 46 - 4 = 42: 8 + 40 do not fit, the title alone with 16 of padding does.
    expect(blockFit({ ...lines, height: 46 })).toEqual({ padding: FACE_PAD, showMeta: false });
  });

  it('tightens the padding when even the title alone would be cut', () => {
    // A one-hour block with a taller title line: 16 + 28 > 40, 8 + 28 fits.
    expect(blockFit({ ...lines, titleHeight: 28, height: 44 })).toEqual({
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
    const short = blockFit({ ...lines, titleHeight: 28, height: 44 });
    expect(tall).toEqual({ padding: FACE_PAD, showMeta: true });
    expect(short.padding).toBe(FACE_PAD_TIGHT);
  });

  it('fits the title whole in an accepted ghost: the walk moved to a one-hour 17:00 slot', () => {
    const accepted = buildTimeline(LAB_ITEMS, new Map(), null, 390, {
      id: 'guide-ghost',
      start: 17 * 60,
      end: 18 * 60,
    }).frames.get('guide-ghost');
    expect(accepted).toBeDefined();
    const height = accepted?.height ?? 0;
    const fit = blockFit({ ...lines, height });
    expect(fit).toEqual({ padding: FACE_PAD_TIGHT, showMeta: false });
    expect(fit.padding * 2 + TITLE).toBeLessThanOrEqual(height - FRAME_PAD * 2);
  });
});
