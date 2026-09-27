import { fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { DoodlePin } from '../DoodlePin';

// Reanimated 4's real native worklets module (react-native-worklets) has no JS-environment stub of
// its own; Reanimated ships this mock precisely for RNTL/jsdom-less unit tests (its own documented
// jest setup). `jest.mock()` factories must be a synchronous inline function, so this stays a
// `require()` rather than an import.
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return
  return require('react-native-reanimated/lib/module/mock.js');
});

describe('DoodlePin', () => {
  it('renders the name and a category-scoped accessibility label', async () => {
    await renderWithI18n(
      <DoodlePin name="Nishiki Market" iconKey="pin-market" categoryLabel="Market" />,
    );
    expect(screen.getByText('Nishiki Market')).toBeTruthy();
    expect(screen.getByLabelText('Nishiki Market, Market')).toBeTruthy();
  });

  it('exposes selected state via accessibilityState, not colour alone', async () => {
    await renderWithI18n(
      <DoodlePin
        name="Fushimi Inari"
        iconKey="pin-temple-shrine"
        categoryLabel="Temple or shrine"
        selected
      />,
    );
    const pin = screen.getByTestId('doodle-pin-pin-temple-shrine');
    expect(pin.props.accessibilityState).toMatchObject({ selected: true });
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await renderWithI18n(
      <DoodlePin
        name="Nishiki Market"
        iconKey="pin-market"
        categoryLabel="Market"
        onPress={onPress}
      />,
    );
    await fireEvent.press(screen.getByTestId('doodle-pin-pin-market'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
