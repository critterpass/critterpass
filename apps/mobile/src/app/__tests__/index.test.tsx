import { describe, expect, it } from '@jest/globals';

import { renderWithI18n } from '../../lib/i18n/testing';
import HomeScreen from '../index';

describe('HomeScreen', () => {
  it('renders the app name and build variant for dev-client verification', async () => {
    const { getByRole, getByLabelText } = await renderWithI18n(<HomeScreen />);

    expect(getByRole('header')).toBeTruthy();
    expect(getByLabelText(/build variant/i)).toBeTruthy();
  });
});
