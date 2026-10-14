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
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { renderWithI18n } from '@/lib/i18n/testing';
import {
  ExternalToasts,
  PremiumThemeProvider,
  ToastHost,
  useToast,
  type ExternalToast,
  type ExternalToastSource,
} from '@/ui/premium';

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

/** A toast queue outside the premium screens, as the island toast queue behaves. */
function queueSource() {
  let current: ExternalToast | null = null;
  const listeners = new Set<() => void>();
  const source: ExternalToastSource = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getCurrent: () => current,
    dismiss: () => {
      current = null;
    },
  };
  const send = (title: string) => {
    current = { id: title, title };
    for (const listener of listeners) listener();
  };
  return { source, send };
}

function SheetUp({ source }: { readonly source: ExternalToastSource }) {
  const [open, setOpen] = useState(true);
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <PremiumThemeProvider>
        <View testID="page">
          <ToastHost>
            <ExternalToasts source={source} />
            <Pressable onPress={() => setOpen(false)}>
              <Text>close sheet</Text>
            </Pressable>
            {open ? (
              <View testID="sheet">
                <ToastHost bottomOffset={0}>
                  <Probe />
                </ToastHost>
              </View>
            ) : null}
          </ToastHost>
        </View>
      </PremiumThemeProvider>
    </SafeAreaProvider>
  );
}

describe('toasts while a sheet is up', () => {
  it('shows a toast sent from outside the screens on the sheet, not under it', async () => {
    const { source, send } = queueSource();
    await renderWithI18n(<SheetUp source={source} />, { locale: 'en' });
    await act(async () => {
      send('Address copied.');
      await Promise.resolve();
    });
    expect(within(screen.getByTestId('sheet')).getByText('Address copied.')).toBeTruthy();
  });

  it('hands a toast still up to the page when the sheet closes', async () => {
    const { source } = queueSource();
    await renderWithI18n(<SheetUp source={source} />, { locale: 'en' });
    await fireEvent.press(screen.getByText('near'));
    await fireEvent.press(screen.getByText('close sheet'));
    expect(screen.queryByTestId('sheet')).toBeNull();
    expect(screen.getByText('Could not remove Hân.')).toBeTruthy();
  });
});
