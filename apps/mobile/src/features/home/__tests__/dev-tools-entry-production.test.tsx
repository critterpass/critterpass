/**
 * The Developer tools link is dropped in production, where Metro removes the (dev) routes it would
 * open. (A separate file: the mocked expo-constants must hold for every module this file loads.)
 */
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { name: 'CritterPass', extra: { appVariant: 'production' } } },
}));
jest.mock('expo-router', () => ({ Link: ({ children }: { children: unknown }) => children }));

import { describe, expect, it, jest } from '@jest/globals';

import { renderWithI18n } from '@/lib/i18n/testing';

import { DevToolsEntry } from '../dev-tools-entry';

describe('DevToolsEntry (production)', () => {
  it('renders nothing', async () => {
    const { queryByTestId } = await renderWithI18n(<DevToolsEntry bottom={0} />);
    expect(queryByTestId('dev-tools-entry')).toBeNull();
  });
});
