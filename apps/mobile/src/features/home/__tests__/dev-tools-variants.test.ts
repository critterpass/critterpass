/**
 * The Developer tools link shows only in development builds (which the e2e-test build profile
 * ships, so Maestro can tap it). Staging testers and production never see it; production also
 * drops the (dev) routes it would open. (A separate file: the mocked expo-constants must hold for
 * every module this file loads.)
 */
const mockExtra: { appVariant: string } = { appVariant: 'development' };
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { name: 'CritterPass', extra: mockExtra };
    },
  },
}));

import { describe, expect, it, jest } from '@jest/globals';

import { showsDevTools } from '../dev-tools';

describe('the Developer tools link', () => {
  it('shows in development builds', () => {
    mockExtra.appVariant = 'development';
    expect(showsDevTools()).toBe(true);
  });

  it.each(['staging', 'production'])('is hidden in %s builds', (variant) => {
    mockExtra.appVariant = variant;
    expect(showsDevTools()).toBe(false);
  });
});
