/** The price display reads the signed-in uid under the same key the database writes it. */

import { describe, expect, it } from '@jest/globals';

import { OWNER_UID_KEY } from '../../powersync/local-tables';
import { OWNER_UID_STATE_KEY } from '../use-money-display';

describe('owner uid key', () => {
  it('matches the local database key', () => {
    expect(OWNER_UID_STATE_KEY).toBe(OWNER_UID_KEY);
  });
});

describe('rateText', () => {
  it('keeps a decimal rate and writes out one read back in exponent form', async () => {
    const { rateText } = await import('../use-money-display');
    expect(rateText('1.3653')).toBe('1.3653');
    expect(rateText(16000)).toBe('16000');
    expect(rateText(6.25e-5)).toBe('0.0000625');
  });
});
