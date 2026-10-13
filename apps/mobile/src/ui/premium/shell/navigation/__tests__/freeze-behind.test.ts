/** Only pages fully covered by opaque pages freeze; the one under the top and see-through stay live. */
import { describe, expect, it } from '@jest/globals';
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';

import { freezeOptions, hiddenBehind } from '../freeze-behind';

type Presentation = NativeStackNavigationOptions['presentation'];
const stack =
  (...presentations: Presentation[]) =>
  (index: number): Presentation =>
    presentations[index];

describe('hiddenBehind', () => {
  it('freezes pages two or more under an opaque top', () => {
    const at = stack(undefined, undefined, 'card', undefined);
    expect(hiddenBehind(0, 3, at)).toBe(true);
    expect(hiddenBehind(1, 3, at)).toBe(true);
  });

  it('keeps the page right under the top and the top itself live', () => {
    const at = stack(undefined, undefined, undefined);
    expect(hiddenBehind(1, 2, at)).toBe(false);
    expect(hiddenBehind(2, 2, at)).toBe(false);
  });

  it('keeps pages live under a see-through presentation', () => {
    expect(hiddenBehind(0, 2, stack(undefined, 'formSheet', 'formSheet'))).toBe(false);
    expect(hiddenBehind(0, 2, stack(undefined, undefined, 'transparentModal'))).toBe(false);
    expect(hiddenBehind(0, 2, stack(undefined, 'modal', undefined))).toBe(false);
  });

  it('freezes under a full-screen cover', () => {
    expect(hiddenBehind(0, 2, stack(undefined, undefined, 'fullScreenModal'))).toBe(true);
  });

  it('never freezes a page it cannot find', () => {
    expect(hiddenBehind(-1, 3, stack())).toBe(false);
  });
});

describe('freezeOptions', () => {
  const routes = [{ key: 'tabs' }, { key: 'trip' }, { key: 'day' }];
  it('passes the native freeze for a hidden page only', () => {
    const state = { index: 2, routes };
    expect(freezeOptions(routes[0]!, state, () => undefined)).toEqual({
      unstable_nativeProps: { freezeOnBlur: true, shouldFreeze: true },
    });
    expect(freezeOptions(routes[1]!, state, () => undefined)).toEqual({});
    expect(freezeOptions(routes[0]!, undefined, () => undefined)).toEqual({});
  });
});
