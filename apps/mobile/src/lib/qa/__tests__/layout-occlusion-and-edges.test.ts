import { describe, expect, it } from '@jest/globals';

import type { QaRect } from '../header-overlap';
import { alignmentProblems } from '../layout-alignment';
import {
  layoutProblems,
  type PlacedControl,
  type PlacedGround,
  type PlacedText,
} from '../layout-geometry';
import { inkOf, type QaLine } from '../layout-rects';
import { solidBand } from '../layout-grounds';

const window = { width: 412, height: 915 };
const at = (x: number, y: number, width: number, height: number): QaRect => ({
  x,
  y,
  width,
  height,
});

let painted = 0;
function ground(key: string, rect: QaRect): PlacedGround {
  painted += 1;
  return { key, paint: painted, rect };
}
function text(
  label: string,
  rect: QaRect,
  extra: Partial<PlacedText> & { lines?: QaLine[] } = {},
): PlacedText {
  painted += 1;
  const { lines, ...rest } = extra;
  return {
    label,
    rect,
    ink: inkOf(rect, lines),
    screen: 'hub',
    layer: null,
    free: false,
    paint: painted,
    grounds: [],
    controls: [],
    ...rest,
  };
}
function control(key: string, rect: QaRect, extra: Partial<PlacedControl> = {}): PlacedControl {
  painted += 1;
  return {
    key,
    label: key,
    rect,
    screen: 'hub',
    layer: null,
    free: false,
    paint: painted,
    grounds: [],
    ...extra,
  };
}
const codes = (input: Parameters<typeof layoutProblems>[0]) =>
  layoutProblems(input).map((p) => `${p.code} ${p.subject}`);

describe('layout checks judge what shows', () => {
  it('leaves door chips the status bar ground hides, and reports them when nothing hides them', () => {
    const page = ground('page', at(0, 0, 412, 915));
    const chip = text('trip-hub-door-plan "Plan"', at(120, 18, 60, 20), { grounds: [page] });
    const statusGround = ground('status-bar-ground', at(0, 0, 412, 50));
    expect(codes({ texts: [chip], controls: [], window, topInset: 48 })).toEqual([
      'TEXT_UNDER_STATUS_BAR hub: trip-hub-door-plan "Plan"',
    ]);
    expect(
      codes({ texts: [chip], controls: [], window, topInset: 48, cover: [page, statusGround] }),
    ).toEqual([]);
  });

  it('still reports words under the status bar when the ground was drawn before them', () => {
    const early = ground('early-band', at(0, 0, 412, 50));
    const title = text('"Marrakech setup"', at(124, 14, 153, 16));
    expect(codes({ texts: [title], controls: [], window, topInset: 62, cover: [early] })).toEqual([
      'TEXT_UNDER_STATUS_BAR hub: "Marrakech setup"',
    ]);
  });

  it('judges a centred line in a full-width box by its words, not by the box', () => {
    const card = { label: 'premium-options', rect: at(10, 602, 392, 213) };
    const centred = text('premium-options "VN 112"', at(10, 614, 392, 18), {
      card,
      lines: [{ x: 166, y: 0, width: 60, height: 18 }],
    });
    expect(codes({ texts: [centred], controls: [], window })).toEqual([]);
    const edge = text('premium-options "A long line"', at(10, 640, 392, 18), {
      card,
      lines: [{ x: 0, y: 0, width: 392, height: 18 }],
    });
    // Lines left from a wider layout than the box it wraps in now: the box is judged.
    const tile = { label: 'search-tile-swipe', rect: at(16, 281, 181, 128) };
    const stale = text('search-tile-swipe "Can\'t agree?"', at(28, 356, 157, 41), {
      card: tile,
      lines: [{ x: 0, y: 0, width: 324, height: 41 }],
    });
    expect(codes({ texts: [stale], controls: [], window })).toEqual([]);
    expect(codes({ texts: [edge], controls: [], window })).toEqual([
      'TEXT_PAST_PADDING hub: premium-options "A long line" at the edge of premium-options',
    ]);
  });

  it('leaves the rows of a list whose words start at one edge', () => {
    const upper = control('inbox-row-a', at(34, 547, 320, 37));
    const upperWords = text('"They are getting ready to go."', at(76, 556, 236, 18), {
      controls: ['inbox-row-a'],
    });
    const lower = control('inbox-row-b', at(34, 604, 320, 37));
    const lowerWords = text('"Maya pinned a stop"', at(76, 615, 188, 13), {
      controls: ['inbox-row-b'],
    });
    expect(
      alignmentProblems({
        texts: [upperWords, lowerWords],
        controls: [upper, lower],
        window: { width: 390, height: 844 },
      }),
    ).toEqual([]);
  });

  it('reads the opaque part of a band fading content into the ground', () => {
    expect(
      solidBand('linear-gradient(180deg, #f3f3f5 0%, #f3f3f5 62.5%, rgba(243,243,245,0) 100%)'),
    ).toEqual({ edge: 'top', share: 0.625 });
    expect(
      solidBand('linear-gradient(0deg, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 40%, transparent 100%)'),
    ).toEqual({ edge: 'bottom', share: 0.4 });
    expect(
      solidBand('linear-gradient(180deg, #f3f3f5 0%, #f3f3f5 0%, transparent 100%)'),
    ).toBeNull();
    expect(
      solidBand(
        'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)',
      ),
    ).toBeNull();
    expect(solidBand(undefined)).toBeNull();
  });
});
