import { i18n } from '@lingui/core';
import { renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Text } from 'react-native';

// See set-locale.test.ts for why react-native-mmkv (a transitive dependency of I18nRoot, via
// set-locale) needs this.
jest.mock('react-native-mmkv', () => ({
  createMMKV: jest.fn(() => ({
    getString: () => undefined,
    set: () => {},
  })),
}));

import { I18nRoot, useI18nReady } from './I18nRoot';
import { renderWithI18n } from './testing';

describe('useI18nReady', () => {
  it('resolves to true once the initial locale (device-preferred, jest-expo mocks en-US) activates', async () => {
    // RNTL's render/renderHook already await pending effects before resolving, so by the time this
    // await returns, the hook's own effect (and the catalog-load promise it starts) may already
    // have settled; this only asserts the state it settles on, not the intermediate `false` value.
    const { result } = await renderHook(() => useI18nReady());
    await waitFor(() => expect(result.current).toBe(true));
    expect(i18n.locale).toBe('en');
  });
});

// The first render loads compiled catalogs, which Jest transforms on a cold cache (tens of seconds on CI).
jest.setTimeout(60_000);

describe('I18nRoot', () => {
  it('provides the active locale to <Trans>/useLingui() consumers', async () => {
    const { getByText } = await renderWithI18n(
      <I18nRoot>
        <Text>inside I18nRoot</Text>
      </I18nRoot>,
      { locale: 'en' },
    );
    expect(getByText('inside I18nRoot')).toBeTruthy();
  });

  it('warns on a genuinely missing message id instead of silently rendering nothing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // The "missing" listener attaches in an effect after mount, so the lookup happens as a
    // follow-up act, not as part of the tree I18nRoot renders on its first pass.
    await renderWithI18n(
      <I18nRoot>
        <Text>ready</Text>
      </I18nRoot>,
      { locale: 'en' },
    );
    i18n._('a.truly.missing.id');

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('a.truly.missing.id'));
    warn.mockRestore();
  });
});
