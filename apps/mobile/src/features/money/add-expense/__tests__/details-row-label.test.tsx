/**
 * The keypad's details row is read as what it holds: the typed name, the category and the day. Read
 * as a fixed "Name, category and day", a screen reader never told the traveller what they had typed
 * (and the iPhone hierarchy, which flows read, held no name either).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('../../../../ui/test-support/skia-double'));

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/lib/theme';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { AddExpenseView } from '../AddExpenseView';
import { newDraft, type ExpenseDraft } from '../draft';

// Imported last: the testing library registers its own Reanimated mock (see jest.config.js).
import { act, renderRouter, screen } from 'expo-router/testing-library';

const METRICS = {
  frame: { x: 0, y: 0, width: 402, height: 874 },
  insets: { top: 62, left: 0, right: 0, bottom: 34 },
};
const ME = '0199a6f0-0000-7000-8000-00000000d002';

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

function view(draft: ExpenseDraft) {
  return function Add() {
    return (
      <AddExpenseView
        crewName="Da Nang crew"
        editing={false}
        draft={draft}
        members={[{ userId: ME, name: 'Winston', joinIndex: 0, active: true }]}
        approx={undefined}
        perMember={null}
        ctaLabel="ADD"
        ctaDisabled
        shake={0}
        submitting={false}
        onKey={jest.fn()}
        onPayer={jest.fn()}
        onMode={jest.fn()}
        onToggle={jest.fn()}
        onStep={jest.fn()}
        onFocus={jest.fn()}
        onCurrency={jest.fn()}
        onDetails={jest.fn()}
        onScanInstead={jest.fn()}
        onSubmit={jest.fn()}
      />
    );
  };
}

const empty = newDraft({ currency: 'VND', payerId: ME, memberIds: [ME] });

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('expense details row', () => {
  it('is read as the typed name, its category and the day', async () => {
    const draft: ExpenseDraft = { ...empty, description: 'Lunch', category: 'food' };
    await renderRouter({ _layout: Root, index: view(draft) }, { initialUrl: '/' });
    await act(async () => {});

    const row = screen.getByTestId('money-add-details-row');
    expect(row.props.accessibilityLabel).toBe('Lunch, Food, Today');
  });
});
