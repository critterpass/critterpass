import { describe, expect, it } from '@jest/globals';

import { decidedRedraftIds } from '../data/decided-redrafts';

const queued = (payload: unknown) => ({ envelope: JSON.stringify({ payload }) });

describe('redrafts decided on this phone', () => {
  it('counts a keep or a put-back still waiting to send', () => {
    const ids = decidedRedraftIds([
      queued({ redraft_id: 'kept', excluded_stable_ids: [] }),
      queued({ redraft_id: 'put-back' }),
    ]);
    expect([...ids]).toEqual(['kept', 'put-back']);
    expect(ids.has('still-open')).toBe(false);
  });

  it('reads nothing from an envelope it cannot parse', () => {
    expect(decidedRedraftIds([{ envelope: '{' }, { envelope: null }, queued({})]).size).toBe(0);
  });
});
