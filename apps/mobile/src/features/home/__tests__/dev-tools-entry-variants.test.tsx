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
jest.mock('expo-router', () => ({ Link: ({ children }: { children: unknown }) => children }));

import { describe, expect, it, jest } from '@jest/globals';

import { renderWithI18n } from '@/lib/i18n/testing';

import { DevToolsEntry } from '../dev-tools-entry';

describe('DevToolsEntry', () => {
  it('shows in development builds', async () => {
    mockExtra.appVariant = 'development';
    const { queryByTestId } = await renderWithI18n(<DevToolsEntry bottom={0} />);
    expect(queryByTestId('dev-tools-entry')).not.toBeNull();
  });

  it.each(['staging', 'production'])('renders nothing in %s builds', async (variant) => {
    mockExtra.appVariant = variant;
    const { queryByTestId } = await renderWithI18n(<DevToolsEntry bottom={0} />);
    expect(queryByTestId('dev-tools-entry')).toBeNull();
  });
});
