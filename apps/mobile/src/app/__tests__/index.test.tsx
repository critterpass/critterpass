import { render } from '@testing-library/react-native';
import { describe, expect, it } from '@jest/globals';

import HomeScreen from '../index';

describe('HomeScreen', () => {
  it('renders the app name and build variant for dev-client verification', async () => {
    const { getByRole, getByLabelText } = await render(<HomeScreen />);

    expect(getByRole('header')).toBeTruthy();
    expect(getByLabelText(/build variant/i)).toBeTruthy();
  });
});
