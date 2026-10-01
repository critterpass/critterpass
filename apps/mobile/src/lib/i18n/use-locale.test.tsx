import { i18n } from '@lingui/core';
import { act, renderHook } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import { Text } from 'react-native';

import { renderWithI18n } from './testing';
import { useActiveLocale, useLocale } from './use-locale';

function LocaleLabel() {
  const locale = useLocale();
  return <Text>{locale}</Text>;
}

describe('useLocale', () => {
  it('re-renders with the new locale when it changes, without remounting the component', async () => {
    const { getByText } = await renderWithI18n(<LocaleLabel />, { locale: 'en' });
    expect(getByText('en')).toBeTruthy();

    await act(() => {
      i18n.loadAndActivate({ locale: 'vi', messages: {} });
    });

    expect(getByText('vi')).toBeTruthy();
  });
});

describe('useActiveLocale', () => {
  it('reads the language with no provider around it and follows a switch', async () => {
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    const { result } = await renderHook(() => useActiveLocale());
    expect(result.current).toBe('en');

    await act(() => {
      i18n.loadAndActivate({ locale: 'vi', messages: {} });
    });

    expect(result.current).toBe('vi');
  });
});
