import { describe, expect, it } from '@jest/globals';

import type { OcrBox } from '../../types';
import { createLineTracker, type LiveObservation } from '../track-lines';

/** A street-food menu as it sits on the table: dish lines with their prices in a right column. */
const MENU: readonly { readonly text: string; readonly bbox: OcrBox }[] = [
  [
    'PHỞ BÒ TÁI',
    'Phở gà',
    'Bún chả Hà Nội',
    'Bún bò Huế',
    'Bánh xèo tôm thịt',
    'Gỏi cuốn (2 cuốn)',
    'Cơm tấm sườn bì',
    'Chả giò hải sản',
  ].flatMap((dish, row) => [
    { text: dish, bbox: [0.12, 0.18 + row * 0.07, 0.42, 0.035] as OcrBox },
    { text: `${45 + row * 5}.000đ`, bbox: [0.68, 0.18 + row * 0.07, 0.16, 0.035] as OcrBox },
  ]),
].flat();

/** Seeded so every run sees the same frames. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SLIPS: Readonly<Record<string, string>> = {
  ở: 'o',
  ò: 'o',
  à: 'a',
  ú: 'u',
  ơ: 'o',
  '0': 'O',
  ả: 'a',
};

/**
 * Forty frames at about three a second of a hand panning over the menu: the camera drifts by up
 * to two line heights between frames, the hand shakes, a line now and then goes unread (glare, a
 * finger) or comes back with a letter misread, and lines slide out of the frame at the edges.
 * Returns each frame's observations with the menu line each one really is.
 */
function panningFrames(seed: number) {
  const next = random(seed);
  const frames: { observations: LiveObservation[]; truth: number[] }[] = [];
  let px = 0;
  let py = 0;
  for (let frame = 0; frame < 40; frame += 1) {
    px += (next() - 0.5) * 0.12;
    py += (next() - 0.5) * 0.14;
    px = Math.max(-0.2, Math.min(0.2, px));
    py = Math.max(-0.25, Math.min(0.25, py));
    const observations: LiveObservation[] = [];
    const truth: number[] = [];
    MENU.forEach((line, index) => {
      const x = line.bbox[0] + px + (next() - 0.5) * 0.01;
      const y = line.bbox[1] + py + (next() - 0.5) * 0.01;
      if (x < 0 || y < 0 || x + line.bbox[2] > 1 || y + line.bbox[3] > 1) return;
      if (next() < 0.08) return;
      const text =
        next() < 0.15
          ? [...line.text].map((c) => (next() < 0.3 ? (SLIPS[c] ?? c) : c)).join('')
          : line.text;
      observations.push({
        text,
        bbox: [x, y, line.bbox[2], line.bbox[3]],
        conf: 0.7 + next() * 0.3,
      });
      truth.push(index);
    });
    // The recogniser reports lines in no fixed order.
    const order = observations.map((_, i) => i).sort(() => next() - 0.5);
    frames.push({
      observations: order.map((i) => observations[i]!),
      truth: order.map((i) => truth[i]!),
    });
  }
  return frames;
}

/** Share of a line's sightings that carry its most common id, over all lines. */
function stability(seed: number): number {
  const tracker = createLineTracker();
  const ids = new Map<number, string[]>();
  for (const frame of panningFrames(seed)) {
    const lines = tracker.update(frame.observations);
    frame.truth.forEach((line, i) => {
      ids.set(line, [...(ids.get(line) ?? []), lines[i]!.id]);
    });
  }
  let stable = 0;
  let total = 0;
  for (const seen of ids.values()) {
    const counts = new Map<string, number>();
    for (const id of seen) counts.set(id, (counts.get(id) ?? 0) + 1);
    stable += Math.max(...counts.values());
    total += seen.length;
  }
  return stable / total;
}

describe('live line tracking', () => {
  it('keeps each menu line on one id across at least 90% of a panning sequence', () => {
    for (const seed of [1, 2, 3, 4, 5]) expect(stability(seed)).toBeGreaterThanOrEqual(0.9);
  });

  it('never gives two lines of one frame the same id', () => {
    const tracker = createLineTracker();
    for (const frame of panningFrames(9)) {
      const ids = tracker.update(frame.observations).map((line) => line.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('keeps the id of a line that was unread for a frame or two', () => {
    const tracker = createLineTracker();
    const dish: LiveObservation = {
      text: 'Bún chả Hà Nội',
      bbox: [0.1, 0.3, 0.4, 0.04],
      conf: 0.9,
    };
    const price: LiveObservation = { text: '55.000đ', bbox: [0.7, 0.3, 0.15, 0.04], conf: 0.9 };
    const [first] = tracker.update([dish, price]);
    tracker.update([price]);
    tracker.update([price]);
    const [again] = tracker.update([{ ...dish, bbox: [0.11, 0.31, 0.4, 0.04] }]);
    expect(again!.id).toBe(first!.id);
    expect(again!.seen).toBe(2);
  });

  it('keeps the clearer read when a blurred frame misreads the line', () => {
    const tracker = createLineTracker();
    tracker.update([{ text: 'Phở bò tái', bbox: [0.1, 0.2, 0.4, 0.04], conf: 0.95 }]);
    const [line] = tracker.update([{ text: 'Pho bo tai', bbox: [0.1, 0.2, 0.4, 0.04], conf: 0.5 }]);
    expect(line!.text).toBe('Phở bò tái');
  });

  it('gives a line that left the view for good a fresh id when it returns much later', () => {
    const tracker = createLineTracker({ maxMissed: 2 });
    const dish: LiveObservation = { text: 'Bánh xèo', bbox: [0.1, 0.5, 0.3, 0.04], conf: 0.9 };
    const [first] = tracker.update([dish]);
    for (let i = 0; i < 4; i += 1) tracker.update([]);
    const [later] = tracker.update([dish]);
    expect(later!.id).not.toBe(first!.id);
  });
});
