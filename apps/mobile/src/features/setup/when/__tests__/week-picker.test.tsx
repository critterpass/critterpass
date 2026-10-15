/**
 * The day picker as an organiser uses it: it opens on the suggested week's month and turns back to
 * this month (so a trip starting this week can still be picked), a first and a last tap lock that
 * range, the ghost after a first tap locks as it stands (another tap re-picks its last day), days
 * before today can't be picked, and Clear starts over.
 */
// The app's own database module loads the native driver; these tests run on the test stack.
jest.mock('@/data/powersync/db', () => ({}));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  // The premium pages declare their native header through the stack's screen.
  Stack: Object.assign(() => null, { Screen: () => null }),
  usePathname: () => '/',
  useLocalSearchParams: () => ({}),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { AccessibilityState } from 'react-native';

import { renderSetup } from '../../test-support/setup-harness';
import { BEST } from '../../test-support/when-fixtures';
import { heatMonths, initialMonth } from '../model';
import { PremiumWeekPicker as WeekPicker } from '../../premium/calendar/week-picker-sheet';

const SPAN = { from: '2026-10-01', to: '2027-01-31' };
// The suggested week falls in a later month than today's.
const NEXT_MONTH = { ...BEST, start: '2026-11-13', end: '2026-11-19' };

function picker(onLock: (start: string, end: string) => void, today?: string) {
  const months = heatMonths([], SPAN);
  return (
    <WeekPicker
      months={months}
      startMonth={initialMonth(months, NEXT_MONTH)}
      total={1}
      lengthDays={3}
      today={today}
      busy={false}
      onLock={onLock}
      onDismiss={() => undefined}
    />
  );
}

const state = (date: string) =>
  (screen.getByTestId(`picker-day-${date}`).props as { accessibilityState?: AccessibilityState })
    .accessibilityState;
const selected = (date: string) => state(date)?.selected === true;
const closed = (date: string) => state(date)?.disabled === true;

describe('picking days', () => {
  it('opens on the suggested month and turns back to this month', async () => {
    const onLock = jest.fn();
    await renderSetup(picker(onLock));
    expect(screen.getByText(/november 2026/iu)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('picker-previous'));
    expect(await screen.findByText(/october 2026/iu)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('picker-day-2026-10-02'));
    await fireEvent.press(screen.getByTestId('picker-day-2026-10-06'));
    expect(selected('2026-10-02')).toBe(true);
    expect(selected('2026-10-04')).toBe(true);
    expect(selected('2026-10-06')).toBe(true);
    expect(selected('2026-10-07')).toBe(false);
    await fireEvent.press(await screen.findByTestId('picker-lock'));
    await waitFor(() => expect(onLock).toHaveBeenCalledWith('2026-10-02', '2026-10-06'));
  });

  it('locks the suggested planned length after one tap, or re-picks its last day', async () => {
    const onLock = jest.fn();
    // With today known it opens on this month.
    await renderSetup(picker(onLock, '2026-10-01'));
    await fireEvent.press(await screen.findByTestId('picker-day-2026-10-02'));
    expect(screen.getByTestId('picker-ghost')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('picker-lock'));
    await waitFor(() => expect(onLock).toHaveBeenCalledWith('2026-10-02', '2026-10-04'));
    await fireEvent.press(screen.getByTestId('picker-day-2026-10-07'));
    expect(screen.queryByTestId('picker-ghost')).toBeNull();
    await fireEvent.press(screen.getByTestId('picker-lock'));
    await waitFor(() => expect(onLock).toHaveBeenLastCalledWith('2026-10-02', '2026-10-07'));
  });

  it('can’t pick a day before today, and clears back to nothing picked', async () => {
    await renderSetup(picker(jest.fn(), '2026-10-05'));
    expect(await screen.findByTestId('picker-day-2026-10-04')).toBeTruthy();
    expect(closed('2026-10-04')).toBe(true);
    await fireEvent.press(screen.getByTestId('picker-day-2026-10-05'));
    await fireEvent.press(screen.getByTestId('picker-day-2026-10-07'));
    expect(screen.getByTestId('picker-lock')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('picker-clear'));
    expect(screen.queryByTestId('picker-lock')).toBeNull();
    expect(screen.queryByTestId('picker-length')).toBeNull();
  });
});

describe('a trip of one', () => {
  it('shows no counts: nothing under the dates and no "can make it" line', async () => {
    await renderSetup(picker(jest.fn(), '2026-10-05'));
    await fireEvent.press(await screen.findByTestId('picker-day-2026-10-08'));
    expect(screen.getByTestId('picker-length')).toBeTruthy();
    expect(screen.queryByTestId('picker-free')).toBeNull();
    expect(screen.queryByText('0/1')).toBeNull();
    expect(screen.queryByText('1/1')).toBeNull();
    // A day already past cannot be picked.
    expect(closed('2026-10-02')).toBe(true);
  });
});

describe('a lock that did not go through', () => {
  it('says so on the sheet, above the lock, which stays to try again', async () => {
    const months = heatMonths([], SPAN);
    await renderSetup(
      <WeekPicker
        months={months}
        startMonth={0}
        total={1}
        lengthDays={3}
        today="2026-10-01"
        busy={false}
        failure="Locking needs signal. Try again in a moment."
        onLock={jest.fn()}
        onDismiss={() => undefined}
        initialPick={{ anchor: null, range: { start: '2026-10-08', end: '2026-10-10' } }}
      />,
    );
    expect(screen.getByTestId('picker-failure')).toHaveTextContent(/needs signal/u);
    expect(screen.getByTestId('picker-lock')).toBeTruthy();
  });
});

describe('the month it opens on', () => {
  it('is this month when no window is offered, whatever month the step suggested', async () => {
    const months = heatMonths([], SPAN);
    await renderSetup(
      <WeekPicker
        months={months}
        startMonth={initialMonth(months, NEXT_MONTH)}
        total={1}
        lengthDays={3}
        today="2026-10-05"
        busy={false}
        onLock={jest.fn()}
        onDismiss={() => undefined}
      />,
    );
    expect(screen.getByText(/october 2026/iu)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('picker-next'));
    expect(await screen.findByText(/november 2026/iu)).toBeTruthy();
  });
});
