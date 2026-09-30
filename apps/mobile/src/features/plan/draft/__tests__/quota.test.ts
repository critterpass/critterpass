import { describe, expect, it } from '@jest/globals';
import { redraftGate, redraftQuota, UNLIMITED_STORED } from '../data/quota';

describe('the redraft quota', () => {
  it('counts a redraft only once its result is delivered', () => {
    expect(redraftQuota({ counted: 2, storedLimit: 3, undelivered: 1 })).toEqual({
      used: 1,
      limit: 3,
    });
    expect(redraftQuota({ counted: 2, storedLimit: 3, undelivered: 0 })).toEqual({
      used: 2,
      limit: 3,
    });
  });

  it('reads the stored sentinel as unlimited and a missing row as the free limit', () => {
    expect(
      redraftQuota({ counted: 7, storedLimit: UNLIMITED_STORED, undelivered: 0 }).limit,
    ).toBeNull();
    expect(redraftQuota({ counted: 0, storedLimit: null, undelivered: 0 }).limit).toBe(3);
  });

  it('raises the interstitial before the last free redraft and the boost when none are left', () => {
    expect(redraftGate({ used: 1, limit: 3 }, false)).toEqual({ kind: 'go' });
    expect(redraftGate({ used: 2, limit: 3 }, false)).toEqual({ kind: 'last', n: 3, limit: 3 });
    expect(redraftGate({ used: 3, limit: 3 }, false)).toEqual({ kind: 'spent', limit: 3 });
  });

  it('never gates an unlimited trip or a free fit-in redraft', () => {
    expect(redraftGate({ used: 40, limit: null }, false)).toEqual({ kind: 'go' });
    expect(redraftGate({ used: 3, limit: 3 }, true)).toEqual({ kind: 'go' });
  });
});
