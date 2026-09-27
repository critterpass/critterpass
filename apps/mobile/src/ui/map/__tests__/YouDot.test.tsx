import { screen } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { YouDot } from '../YouDot';

describe('YouDot', () => {
  it('always carries a "Your location" label — colour is never the only signal', async () => {
    await renderWithI18n(<YouDot />);
    expect(screen.getByLabelText('Your location')).toBeTruthy();
    expect(screen.getByTestId('you-dot')).toBeTruthy();
  });
});
