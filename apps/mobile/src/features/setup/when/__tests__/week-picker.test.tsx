/**
 * The day picker as an organiser uses it: it opens on the suggested week's month and turns back to
 * this month (so a trip starting this week can still be picked), a first and a last tap lock that
 * range, the ghost after a first tap locks as it stands (another tap re-picks its last day), days
 * before today can't be picked, and Clear starts over.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({ useIsFocused: () => true, router: { back: jest.fn() } }));

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { renderSetup } from '../../test-support/setup-harness';
import { BEST } from '../fixtures';
import { heatMonths, initialMonth } from '../model';
import { WeekPicker } from '../week-picker';

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

describe('picking days', () => {
  it('opens on the suggested month and turns back to this month for screen readers', async () => {
    const onLock = jest.fn();
    await renderSetup(picker(onLock));
    expect(screen.getByText(/november 2026/iu)).toBeTruthy();
    await fireEvent(screen.getByTestId('picker-month'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    expect(await screen.findByText(/october 2026/iu)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('heat-pick-2026-10-02'));
    await fireEvent.press(screen.getByTestId('heat-pick-2026-10-06'));
    expect(screen.getByLabelText('October 2, first day')).toBeTruthy();
    expect(screen.getByLabelText('October 6, last day')).toBeTruthy();
    await fireEvent.press(await screen.findByTestId('picker-lock'));
    await waitFor(() => expect(onLock).toHaveBeenCalledWith('2026-10-02', '2026-10-06'));
  });

  it('locks the suggested planned length after one tap, or re-picks its last day', async () => {
    const onLock = jest.fn();
    // With today known it opens on this month.
    await renderSetup(picker(onLock, '2026-10-01'));
    await fireEvent.press(await screen.findByTestId('heat-pick-2026-10-02'));
    expect(screen.getByTestId('picker-ghost')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('picker-lock'));
    await waitFor(() => expect(onLock).toHaveBeenCalledWith('2026-10-02', '2026-10-04'));
    await fireEvent.press(screen.getByTestId('heat-pick-2026-10-07'));
    expect(screen.queryByTestId('picker-ghost')).toBeNull();
    await fireEvent.press(screen.getByTestId('picker-lock'));
    await waitFor(() => expect(onLock).toHaveBeenLastCalledWith('2026-10-02', '2026-10-07'));
  });

  it('can’t pick a day before today, and clears back to nothing picked', async () => {
    await renderSetup(picker(jest.fn(), '2026-10-05'));
    expect(await screen.findByTestId('heat-2026-10-04')).toBeTruthy();
    expect(screen.queryByTestId('heat-pick-2026-10-04')).toBeNull();
    await fireEvent.press(screen.getByTestId('heat-pick-2026-10-05'));
    await fireEvent.press(screen.getByTestId('heat-pick-2026-10-07'));
    expect(screen.getByTestId('picker-lock')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('picker-clear'));
    expect(screen.queryByTestId('picker-lock')).toBeNull();
    expect(screen.queryByTestId('picker-length')).toBeNull();
  });
});

describe('a trip of one', () => {
  it('shows no counts: nothing under the dates and no "can make it" line', async () => {
    await renderSetup(picker(jest.fn(), '2026-10-05'));
    await fireEvent(screen.getByTestId('picker-month'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });
    await fireEvent.press(await screen.findByTestId('heat-pick-2026-10-08'));
    expect(screen.getByTestId('picker-length')).toBeTruthy();
    expect(screen.queryByTestId('picker-free')).toBeNull();
    expect(screen.queryByText('0/1')).toBeNull();
    expect(screen.queryByText('1/1')).toBeNull();
    // A day already past is a plain day that cannot be picked.
    expect(screen.queryByTestId('heat-pick-2026-10-02')).toBeNull();
    expect(screen.getByLabelText('October 2')).toBeTruthy();
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
    // Paged on, "Today" brings her back.
    await fireEvent(screen.getByTestId('picker-month'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    expect(await screen.findByText(/november 2026/iu)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('picker-today'));
    expect(await screen.findByText(/october 2026/iu)).toBeTruthy();
  });
});
