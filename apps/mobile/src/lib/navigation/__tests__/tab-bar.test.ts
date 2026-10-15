import { describe, expect, it } from '@jest/globals';

import { tabBarHidden, tabSheetUp } from '../tab-bar';

type Route = { name: string; state?: State };
type State = { index: number; routes: Route[] };

const stack = (index: number, ...routes: Route[]): State => ({ index, routes });
const tabs = (tab: Route): State =>
  stack(0, { name: '(tabs)', state: stack(0, tab) }, { name: 'hub' });

describe('tab bar', () => {
  it('shows on a tab root, either Wallet half included', () => {
    expect(tabBarHidden(tabs({ name: 'index' }))).toBe(false);
    expect(tabBarHidden(tabs({ name: 'trips', state: stack(0, { name: 'index' }) }))).toBe(false);
    const bookingsOverMoney = {
      name: 'wallet',
      state: stack(
        1,
        { name: 'money/index' },
        { name: 'bookings', state: stack(0, { name: 'index' }) },
      ),
    };
    expect(tabBarHidden(tabs(bookingsOverMoney))).toBe(false);
  });

  it('hides on a page pushed inside a tab', () => {
    const add = {
      name: 'wallet',
      state: stack(0, {
        name: 'bookings',
        state: stack(1, { name: 'index' }, { name: 'add' }),
      }),
    };
    expect(tabBarHidden(tabs(add))).toBe(true);
    const budget = {
      name: 'wallet',
      state: stack(1, { name: 'money/index' }, { name: 'money/budget' }),
    };
    expect(tabBarHidden(tabs(budget))).toBe(true);
  });

  it('keeps what is under a sheet', () => {
    const sheetOverRoot = {
      name: 'wallet',
      state: stack(1, { name: 'money/index' }, { name: 'money/currency' }),
    };
    expect(tabBarHidden(tabs(sheetOverRoot))).toBe(false);
    const passOverBooking = {
      name: 'wallet',
      state: stack(0, {
        name: 'bookings',
        state: stack(2, { name: 'index' }, { name: '[id]' }, { name: 'pass/[id]' }),
      }),
    };
    expect(tabBarHidden(tabs(passOverBooking))).toBe(true);
  });

  it("reads through the router's own root route", () => {
    const add = {
      name: 'wallet',
      state: stack(0, { name: 'bookings', state: stack(1, { name: 'index' }, { name: 'add' }) }),
    };
    expect(tabBarHidden(stack(0, { name: '__root', state: tabs(add) }))).toBe(true);
  });

  it('reads only the focused tab and the focused routes', () => {
    const popped = {
      name: 'wallet',
      state: stack(0, { name: 'money/index' }, { name: 'money/budget' }),
    };
    expect(tabBarHidden(tabs(popped))).toBe(false);
    expect(tabBarHidden(undefined)).toBe(false);
    // A tab whose stack has not mounted yet.
    expect(tabBarHidden(tabs({ name: 'wallet' }))).toBe(false);
  });

  it('tells when the focused tab shows one of its sheets', () => {
    const addSheet = {
      name: 'wallet',
      state: stack(0, {
        name: 'bookings',
        state: stack(1, { name: 'index' }, { name: 'add-sheet' }),
      }),
    };
    expect(tabSheetUp(tabs(addSheet))).toBe(true);
    const currency = {
      name: 'wallet',
      state: stack(1, { name: 'money/index' }, { name: 'money/currency' }),
    };
    expect(tabSheetUp(tabs(currency))).toBe(true);
    const closed = {
      name: 'wallet',
      state: stack(0, { name: 'money/index' }, { name: 'money/currency' }),
    };
    expect(tabSheetUp(tabs(closed))).toBe(false);
    expect(tabSheetUp(tabs({ name: 'index' }))).toBe(false);
    expect(tabSheetUp(undefined)).toBe(false);
  });
});
