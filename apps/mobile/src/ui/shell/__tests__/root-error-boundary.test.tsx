import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RootErrorBoundary } from '../RootErrorBoundary';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('RootErrorBoundary', () => {
  // Expo Router renders a layout's ErrorBoundary in place of the layout itself, so the root one sits
  // above I18nRoot and ThemeProvider; only Expo Router's own SafeAreaProvider is above it. A boundary that needs those providers throws while handling the
  // error, and in a release build that second throw is fatal: the app terminates instead of showing
  // the recovery panel.
  it('renders its recovery panel without any provider above it', async () => {
    i18n.loadAndActivate({ locale: 'en', messages: {} });
    const retry = jest.fn(() => Promise.resolve());

    const { getByRole, getByTestId, queryByTestId } = await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <RootErrorBoundary error={new Error('render failed')} retry={retry} />
      </SafeAreaProvider>,
    );

    expect(getByTestId('shell-error')).toBeTruthy();
    expect(getByRole('header')).toBeTruthy();
    // Navigation never rendered here, so there is nothing to go back to.
    expect(queryByTestId('shell-error-back')).toBeNull();
    expect(getByTestId('shell-error-home')).toBeTruthy();
    await fireEvent.press(getByTestId('shell-error-retry'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
