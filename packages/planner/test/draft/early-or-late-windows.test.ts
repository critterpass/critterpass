/**
 * A place good early in the morning or late, and not in the rest of the morning (the old bridge
 * before the crowds or under its lanterns), is held to the early morning or the late time: never
 * mid-morning. A place good all morning keeps the whole morning.
 */
import { describe, expect, it } from 'vitest';

import { placeWindows, type DraftPoi } from '../../src/draft/index';
import { FRAME, place } from './day-sense-fixture';

const DATE = FRAME.dates[1] as string;

const bridge = (bestTimes: NonNullable<DraftPoi['bestTimes']>, category = 'landmark') =>
  place(51, 'Old Bridge', category, { bestTimes, durationMin: 45 });

const firstEnds = (poi: DraftPoi) => placeWindows(poi, DATE)[0]?.toMin;

describe('early or late places', () => {
  it('holds an early-morning-or-evening place to the early morning', () => {
    const windows = placeWindows(bridge(['early_morning', 'evening']), DATE);
    expect(windows).toHaveLength(2);
    expect(windows[0]?.toMin).toBe(8 * 60 + 30);
    expect(windows[1]?.fromMin).toBeGreaterThanOrEqual(17 * 60);
  });

  it('keeps the whole morning for a place good all morning', () => {
    expect(firstEnds(bridge(['early_morning', 'morning', 'sunset']))).toBe(11 * 60);
    expect(firstEnds(bridge(['morning', 'sunset']))).toBe(11 * 60);
  });

  it('holds an early-or-sunset beach to the early morning too', () => {
    expect(firstEnds(bridge(['early_morning', 'sunset'], 'beach'))).toBe(8 * 60 + 30);
    expect(firstEnds(bridge(['morning', 'sunset'], 'beach'))).toBe(10 * 60 + 30);
  });
});
