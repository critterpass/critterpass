// The shared Reanimated stand-in has no `ReduceMotion`, which the premium springs read at import.
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual<Record<string, unknown>>('react-native-reanimated'),
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
}));

/**
 * A toast queued outside the premium screens (the island toast queue) shows as a premium toast and
 * leaves its queue, so the current UI's island never draws it too; its action keeps its own word.
 */
import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { toastQueue } from '@/motion/island-toast';

import { renderWithI18n } from '@/lib/i18n/testing';
import { ExternalToasts, PremiumThemeProvider, ToastHost } from '@/ui/premium';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('ExternalToasts', () => {
  it('takes a queued toast off its queue and shows it with its action word', async () => {
    let opened = 0;
    await renderWithI18n(
      <SafeAreaProvider initialMetrics={METRICS}>
        <PremiumThemeProvider>
          <ToastHost>
            <ExternalToasts source={toastQueue} />
          </ToastHost>
        </PremiumThemeProvider>
      </SafeAreaProvider>,
      { locale: 'en' },
    );
    await act(() => {
      toastQueue.show({
        id: 'icon',
        title: 'The app icon is back to Passport.',
        action: { label: 'Open', onPress: () => (opened += 1) },
      });
    });
    expect(toastQueue.getCurrent()).toBeNull();
    expect(screen.getByText('The app icon is back to Passport.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Open'));
    expect(opened).toBe(1);
  });
});
