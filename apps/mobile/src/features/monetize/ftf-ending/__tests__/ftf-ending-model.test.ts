import { describe, expect, it } from '@jest/globals';

import { ftfEndingModel } from '../ftf-ending-model';

const NOW = new Date('2026-10-23T06:00:00Z');
const row = { ends_at: '2026-10-26T00:00:00Z', abuse_decision: 'allowed', place: 'Kyoto' };

describe('free first trip ending', () => {
  it('counts the days left and is due in the last three', () => {
    expect(ftfEndingModel(row, NOW)).toEqual({
      place: 'Kyoto',
      endsAt: new Date('2026-10-26T00:00:00Z'),
      daysLeft: 3,
      due: true,
    });
    expect(ftfEndingModel(row, new Date('2026-10-20T00:00:00Z'))?.due).toBe(false);
  });

  it('has nothing to show for a revoked grant, a closed window or no grant', () => {
    expect(ftfEndingModel({ ...row, abuse_decision: 'revoked' }, NOW)).toBeNull();
    expect(ftfEndingModel(row, new Date('2026-10-26T00:00:00Z'))).toBeNull();
    expect(ftfEndingModel(undefined, NOW)).toBeNull();
  });
});
