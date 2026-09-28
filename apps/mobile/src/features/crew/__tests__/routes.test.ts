import { describe, expect, it } from '@jest/globals';

import { hrefFor, isScreenRegistered } from '@/lib/navigation/screen-registry';

import '../routes';

describe('crew screens in the registry', () => {
  it('opens 3g-3 on the crews sheet', () => {
    expect(isScreenRegistered('3g-3')).toBe(true);
    expect(hrefFor('3g-3')).toBe('/crew');
  });
});
