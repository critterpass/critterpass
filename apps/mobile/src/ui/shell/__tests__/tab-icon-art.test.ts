import { describe, expect, it } from '@jest/globals';

import { build, CLEAR_FILL } from '@cp/critter-art';
import type { Model } from '@cp/critter-art';
import { tokens } from '@cp/design-tokens';

import { tabIconArt } from '../tab-icon-art';
import type { TabIconKind } from '../tab-icon-art';

const ACTIVE = tokens.color.yellow;

function model(kind: TabIconKind): Model {
  return build({ kind, seed: 7, sticker: null, ...tabIconArt(kind, ACTIVE) }, tokens.space['24']);
}

/** Washes and fills that paint the tab colour solidly: what reads as a filled blob at 24 pt. */
function solidAreas(art: Model) {
  return art.ops.filter(
    (op) => (op.t === 'wash' || op.t === 'fill') && op.color === ACTIVE && op.alpha === 1,
  );
}

describe('tab icon art', () => {
  it('draws the Pass egg as an outline with a clear shell and tab-coloured spots', () => {
    const egg = model('egg');
    expect(solidAreas(egg)).toEqual([]);
    const washes = egg.ops.filter((op) => op.t === 'wash');
    // The shell wash first, then the four spots.
    expect(washes[0]?.color).toBe(CLEAR_FILL);
    expect(washes.slice(1).map((op) => op.color)).toEqual([ACTIVE, ACTIVE, ACTIVE, ACTIVE]);
    expect(egg.ops.filter((op) => op.t === 'line').every((op) => op.color === ACTIVE)).toBe(true);
    expect(egg.blend).toBe('srcOver');
  });

  it('keeps the line doodles as single-colour masks', () => {
    for (const kind of ['pin', 'ticket', 'wallet'] as const) {
      const art = model(kind);
      expect(art.ops.every((op) => op.color === ACTIVE)).toBe(true);
      expect(art.blend).toBe('srcOver');
    }
  });
});
