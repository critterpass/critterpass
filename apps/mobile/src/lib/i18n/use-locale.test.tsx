import { i18n } from '@lingui/core';
import { act } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';
import { Text } from 'react-native';

import { renderWithI18n } from './testing';
import { useLocale } from './use-locale';

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
