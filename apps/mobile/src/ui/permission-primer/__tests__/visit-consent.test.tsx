import { fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { renderUi } from '../../test-support/render';
import { VisitConsentSheet, VisitDetectionSettings } from '../VisitConsentSheet';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const renderWithInsets = (ui: ReactElement) =>
  renderUi(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);

describe('visit consent', () => {
  it('says what is kept (places, never a trail) and records the answer', async () => {
    const onAnswer = jest.fn();
    await renderWithInsets(<VisitConsentSheet onAnswer={onAnswer} />);
    expect(
      screen.getByText(/places on your plan that you actually reach, never a trail of coordinates/),
    ).toBeTruthy();
    await fireEvent.press(screen.getByTestId('visit-consent-accept'));
    await fireEvent.press(screen.getByTestId('visit-consent-decline'));
    expect(onAnswer.mock.calls).toEqual([[true], [false]]);
  });

  it('offers the Settings toggle, off by default for the caller to pass', async () => {
    const onChange = jest.fn();
    await renderWithInsets(<VisitDetectionSettings granted={false} onChange={onChange} />);
    const toggle = screen.getByRole('switch', { name: /Remember places you visit/ });
    expect(toggle.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
