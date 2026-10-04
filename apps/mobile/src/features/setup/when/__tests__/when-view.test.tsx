/**
 * The dates step's view: the best week as a band, its pill, spoken cells and lock; no week
 * fitting everyone with the options, the guide's pick and a CTA that follows the selection; the
 * ask's progress on its card; a member's view without organiser actions; and the own-calendar row
 * through each of its states.
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
import { fireEvent, screen } from '@testing-library/react-native';

import { DEV, kyotoTrip, sceneFrame } from '../../scenes/fixtures';
import { renderSetup } from '../../test-support/setup-harness';
import { ASK, FULL, PARTIAL, whenModel } from '../fixtures';
import { WhenView, type WhenActions, type WhenModel } from '../when-view';

function actions(): WhenActions & Record<string, jest.Mock> {
  return {
    onSelect: jest.fn(),
    onLock: jest.fn(),
    onAsk: jest.fn(),
    onPickWeek: jest.fn(),
    onConnect: jest.fn(),
    onMarkByHand: jest.fn(),
  };
}

async function show(model: WhenModel, handlers = actions(), me?: string) {
  const trip = kyotoTrip(me === undefined ? {} : { me });
  await renderSetup(<WhenView shell={sceneFrame(trip, 'when')} model={model} actions={handlers} />);
  return handlers;
}

const noFit = (extra: Partial<WhenModel> = {}) =>
  whenModel({
    mode: 'no_fit',
    best: null,
    options: [PARTIAL, FULL, ASK],
    selectedId: ASK.id,
    synced: 6,
    ...extra,
  });

describe('dates step view', () => {
  it('shows the week everyone can make, reads each day as a count and locks it', async () => {
    const handlers = await show(whenModel({}));
    expect(screen.getByText('WHEN CAN EVERYONE GO?')).toBeTruthy();
    expect(screen.getByText('From five synced calendars. Dev hasn’t connected yet.')).toBeTruthy();
    // The best week's ends say so; every day in it is selected, the rest are not.
    expect(screen.getByLabelText('April 2, first day, 6 of 6 free')).toBeTruthy();
    expect(screen.getByLabelText('April 9, last day, 6 of 6 free')).toBeTruthy();
    expect(screen.getByLabelText('April 5, 6 of 6 free').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(screen.getByLabelText('April 27, 1 of 6 free').props.accessibilityState).toEqual({
      selected: false,
    });
    expect(screen.getByTestId('heatmap-window')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('when-cta'));
    expect(handlers.onLock).toHaveBeenCalledWith('2027-04-02', '2027-04-09');
  });

  it('counts a single synced calendar in the singular', async () => {
    await show(whenModel({ synced: 1 }));
    expect(screen.getByText('From one synced calendar. Five still to come.')).toBeTruthy();
  });

  it('offers the ways out when no week fits, with the guide’s pick selected', async () => {
    const handlers = await show(noFit());
    expect(screen.getByText('NO WEEK FITS ALL SIX')).toBeTruthy();
    expect(screen.getByText('ASK DEV FIRST')).toBeTruthy();
    expect(
      screen.getByText('Dev can’t make all of it and would miss Inari and Arashiyama.'),
    ).toBeTruthy();
    expect(screen.getByText("PON'S PICK")).toBeTruthy();
    await fireEvent.press(screen.getByTestId('when-cta'));
    expect(handlers.onAsk).toHaveBeenCalledWith(ASK);
    await fireEvent.press(screen.getByTestId('window-option-full_crew'));
    expect(handlers.onSelect).toHaveBeenCalledWith(FULL.id);
  });

  it('turns the CTA into a lock when a week is selected', async () => {
    const handlers = await show(noFit({ selectedId: FULL.id }));
    await fireEvent.press(screen.getByTestId('when-cta'));
    expect(handlers.onLock).toHaveBeenCalledWith('2027-04-16', '2027-04-23');
  });

  it('lets the organiser pick a week before anyone has shared a day', async () => {
    const handlers = await show(
      whenModel({ mode: 'empty', best: null, options: [], months: [], synced: 0 }),
    );
    expect(screen.queryByTestId('when-cta')).toBeNull();
    await fireEvent.press(screen.getByTestId('when-pick-week'));
    expect(handlers.onPickWeek).toHaveBeenCalled();
  });

  it('gives a member no lock or ask, only their own part', async () => {
    const handlers = await show(
      whenModel({ me: DEV, calendar: { status: 'needs_permission', lastSyncedAt: null } }),
      actions(),
      DEV,
    );
    expect(screen.queryByTestId('when-cta')).toBeNull();
    expect(screen.queryByTestId('when-pick-week')).toBeNull();
    expect(screen.getByText('Your days aren’t in yet')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('own-calendar-action'));
    expect(handlers.onConnect).toHaveBeenCalled();
  });
});
