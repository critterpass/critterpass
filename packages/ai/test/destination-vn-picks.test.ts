import { describe, expect, it } from 'vitest';

import { keepListedPicks } from '../src/routes/destination-vn-picks';

const candidates = [
  { id: 1, name: 'Quy Nhơn', population: 210_000 },
  { id: 2, name: 'An Nhơn', population: 180_000 },
  { id: 3, name: 'Hoài Nhơn', population: 90_000 },
];

describe('keepListedPicks', () => {
  it('drops ids outside the candidate list, repeats and empty reasons, keeping at most four', () => {
    const picks = keepListedPicks(
      {
        picks: [
          { id: 1, reason: 'Beaches and Cham towers' },
          { id: 99, reason: 'Invented town' },
          { id: 1, reason: 'Again' },
          { id: 2, reason: '  ' },
          { id: 3, reason: 'Fishing villages along the coast' },
        ],
      },
      candidates,
    );
    expect(picks).toEqual([
      { id: 1, reason: 'Beaches and Cham towers' },
      { id: 3, reason: 'Fishing villages along the coast' },
    ]);
  });
});
