jest.unmock('expo-router');

import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Slot } from 'expo-router';
import { useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { ThemeProvider } from '../../../lib/theme';
import { BookingFormView } from '../detail/BookingFormView';
import { emptyDraft, type BookingDraft } from '../detail/form-model';

// Imported last: the testing library registers its own Reanimated mock (see jest.config.js).
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const ZONE = { city: 'Ho Chi Minh', offset: 'GMT+7' };
const changes: Partial<BookingDraft>[] = [];

function Root() {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <I18nProvider i18n={i18n}>
        <ThemeProvider>
          <GestureHandlerRootView>
            <ScreenJoltProvider>
              <Slot />
            </ScreenJoltProvider>
          </GestureHandlerRootView>
        </ThemeProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function Form() {
  const [draft, setDraft] = useState(emptyDraft('flight'));
  return (
    <BookingFormView
      mode="add"
      draft={draft}
      problems={[]}
      showProblems={false}
      saving={false}
      zones={{ dep: ZONE, arr: ZONE }}
      trip={{ start: '2026-10-03', end: '2026-10-05' }}
      onChange={(patch) => {
        changes.push(patch);
        setDraft((current) => ({ ...current, ...patch }));
      }}
      onSave={jest.fn()}
    />
  );
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('booking form day', () => {
  it('presents the month grid over the whole screen, not inside the form, and picks the day', async () => {
    await renderRouter({ _layout: Root, index: Form }, { initialUrl: '/' });
    await act(async () => {});
    await fireEvent.press(screen.getByTestId('bookings-form-date'));
    await act(async () => {});

    // A sheet fills the view it is placed in: inside the form it would be squeezed into the Day
    // field's column and scroll with the fields.
    expect(screen.getByTestId('bookings-date-sheet')).toBeTruthy();
    expect(
      within(screen.getByTestId('bookings-form-scroll')).queryByTestId('bookings-date-sheet'),
    ).toBeNull();

    await fireEvent.press(screen.getByTestId('bookings-date-2026-10-04'));
    await act(async () => {});
    expect(changes).toContainEqual({ date: '2026-10-04' });
  });
});
