// The shared Reanimated stand-in has no `ReduceMotion`, which the premium springs read at import.
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual<Record<string, unknown>>('react-native-reanimated'),
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
}));

/**
 * A native sheet draws above the page's toast host, so a sheet holds its own: a toast raised in it
 * shows on the sheet, and `outer` sends one to the page underneath (a "Saved" sent as it closes).
 */
import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, within } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { renderWithI18n } from '@/lib/i18n/testing';
import { PremiumThemeProvider, ToastHost, useToast } from '@/ui/premium';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Probe() {
  const near = useToast();
  const outer = useToast({ outer: true });
  return (
    <>
      <Pressable onPress={() => near.show({ kind: 'error', message: 'Could not remove Hân.' })}>
        <Text>near</Text>
      </Pressable>
      <Pressable onPress={() => outer.show({ kind: 'done', message: 'Saved.' })}>
        <Text>outer</Text>
      </Pressable>
    </>
  );
}

async function renderNested(withSheetHost: boolean) {
  await renderWithI18n(
    <SafeAreaProvider initialMetrics={METRICS}>
      <PremiumThemeProvider>
        <View testID="page">
          <ToastHost>
            <View testID="sheet">
              {withSheetHost ? (
                <ToastHost bottomOffset={0}>
                  <Probe />
                </ToastHost>
              ) : (
                <Probe />
              )}
            </View>
          </ToastHost>
        </View>
      </PremiumThemeProvider>
    </SafeAreaProvider>,
    { locale: 'en' },
  );
}

describe('ToastHost inside another host', () => {
  it('shows a toast on the nearest host', async () => {
    await renderNested(true);
    await fireEvent.press(screen.getByText('near'));
    expect(within(screen.getByTestId('sheet')).getByText('Could not remove Hân.')).toBeTruthy();
  });

  it('sends an outer toast to the page underneath, not the sheet', async () => {
    await renderNested(true);
    await fireEvent.press(screen.getByText('outer'));
    expect(screen.getByText('Saved.')).toBeTruthy();
    expect(within(screen.getByTestId('sheet')).queryByText('Saved.')).toBeNull();
  });

  it('falls back to the only host when there is no outer one', async () => {
    await renderNested(false);
    await fireEvent.press(screen.getByText('outer'));
    expect(screen.getByText('Saved.')).toBeTruthy();
  });
});
