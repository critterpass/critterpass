// A separate file (rather than jest.resetModules() mid-file) so the mocked expo-constants module
// and every module that reads it (including @lingui/react's context) stay on one consistent
// registry for the whole file — resetting modules mid-file would re-import @lingui/react under a
// second registry with a context object HomeScreen's I18nProvider from ../../lib/i18n/testing
// (imported before the reset) can no longer see.
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { name: 'Critterpass', extra: { appVariant: 'production' } } },
}));

import { describe, expect, it, jest } from '@jest/globals';

import { renderWithI18n } from '../../lib/i18n/testing';
import HomeScreen from '../index';

describe('HomeScreen (production variant)', () => {
  it('hides the developer tools entry, since Metro drops the (dev) route it would link to', async () => {
    const { queryByTestId } = await renderWithI18n(<HomeScreen />);

    expect(queryByTestId('dev-tools-entry')).toBeNull();
  });
});
