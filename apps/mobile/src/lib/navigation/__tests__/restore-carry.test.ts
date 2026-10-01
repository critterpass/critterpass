import { afterEach, describe, expect, it } from '@jest/globals';

import {
  carryNavigationTo,
  clearSavedNavigation,
  readSavedNavigation,
  RESTORE_WINDOW_MS,
  shouldRestore,
  writeSavedNavigation,
} from '../restore';

const RUNNING = '1.0.0:0199b0c1-5a00-7d21-9c1e-2b7f4a6d8e90';
const UPDATE = '1.0.0:0199b0f4-11c2-7a05-b3d8-6e9a1c2f4b77';
const STATE = { index: 1, routes: [{ name: '(tabs)' }, { name: 'draft' }] };
const NOW = 1_790_000_000_000;

afterEach(() => clearSavedNavigation());

describe('carryNavigationTo', () => {
  it('lets the restore after an update restart take the screen the person was on', () => {
    writeSavedNavigation({ savedAt: NOW - 60_000, build: RUNNING, state: STATE });
    expect(shouldRestore(readSavedNavigation(), NOW, UPDATE, null)).toBe(false);

    carryNavigationTo(UPDATE);
    const carried = readSavedNavigation();
    expect(carried).toEqual({ savedAt: NOW - 60_000, build: UPDATE, state: STATE });
    expect(shouldRestore(carried, NOW, UPDATE, null)).toBe(true);
  });

  it('keeps the age, so a stale screen is still not restored', () => {
    writeSavedNavigation({ savedAt: NOW - RESTORE_WINDOW_MS - 1, build: RUNNING, state: STATE });
    carryNavigationTo(UPDATE);
    expect(shouldRestore(readSavedNavigation(), NOW, UPDATE, null)).toBe(false);
  });

  it('writes nothing when nothing was saved', () => {
    carryNavigationTo(UPDATE);
    expect(readSavedNavigation()).toBeUndefined();
  });
});
