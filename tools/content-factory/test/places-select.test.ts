import { describe, expect, it } from 'vitest';

import { pickCurated, type SelectionCandidate } from '../src/kinds/places/select';

const c = (id: string, extra: Partial<SelectionCandidate> = {}): SelectionCandidate => ({
  id,
  name: id,
  category: 'food',
  address: null,
  corroborated: false,
  editorial: false,
  ...extra,
});

describe('pickCurated', () => {
  it('gives each bucket its share, then fills the rest with the best scored places anywhere', () => {
    const food = [c('f1'), c('f2'), c('f3'), c('f4')];
    const sights = [c('s1'), c('s2')];
    const scores = new Map([
      ['f1', 1],
      ['f2', 3],
      ['f3', 3],
      ['f4', 2],
      ['s1', 1],
    ]);
    const picked = pickCurated(
      [
        { share: 0.5, candidates: food },
        { share: 0.5, candidates: sights },
      ],
      scores,
      4,
    );
    // Food's two best, the only scored sight, then the next best scored place (a food one).
    expect(picked).toEqual(['f2', 'f3', 's1', 'f4']);
  });

  it('keeps earlier editorial picks and falls back to unscored places when a city is thin', () => {
    const picked = pickCurated(
      [
        {
          share: 1,
          candidates: [c('a'), c('b', { editorial: true }), c('c', { corroborated: true })],
        },
      ],
      new Map(),
      2,
    );
    expect(picked).toEqual(['b', 'c']);
  });
});

describe("a destination's landmarks", () => {
  it('enter the curated set whatever their bucket share or score', () => {
    const food = [c('f1'), c('f2'), c('f3')];
    const sights = [c('s1'), c('s2'), c('my-son', { category: 'other' })];
    const scores = new Map([
      ['f1', 3],
      ['f2', 3],
      ['f3', 3],
      ['s1', 3],
      ['s2', 2],
    ]);
    const picked = pickCurated(
      [
        { share: 0.5, candidates: food },
        { share: 0.5, candidates: sights },
      ],
      scores,
      4,
      ['my-son'],
    );
    expect(picked).toContain('my-son');
    expect(picked).toHaveLength(4);
  });
});
