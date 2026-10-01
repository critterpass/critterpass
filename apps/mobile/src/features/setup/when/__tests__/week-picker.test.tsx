/**
 * The week picker opens on the suggested week's month and pages back to this month, so a trip
 * starting this week can still be picked.
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

describe('week picker paging', () => {
  it('opens on the suggested month and pages back to this month', async () => {
    const months = heatMonths([], SPAN);
    const onLock = jest.fn();
    await renderSetup(
      <WeekPicker
        months={months}
        startMonth={initialMonth(months, NEXT_MONTH)}
        total={1}
        lengthDays={3}
        busy={false}
        onLock={onLock}
        onDismiss={() => undefined}
      />,
    );
    expect(screen.getByText(/november 2026/iu)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Previous month'));
    expect(await screen.findByText(/october 2026/iu)).toBeTruthy();
    fireEvent.press(screen.getByTestId('heat-pick-2026-10-02'));
    fireEvent.press(await screen.findByTestId('picker-lock'));
    await waitFor(() => expect(onLock).toHaveBeenCalledWith('2026-10-02', '2026-10-04'));
  });
});
