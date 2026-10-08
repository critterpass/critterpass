/**
 * The sign-out warning reads "is this pass saved?" again whenever its screen comes back to the
 * front: the pass can be saved from a page pushed over it, and the warning must not outlive that.
 */
const focus = { on: true };
jest.mock('expo-router', () => ({ useIsFocused: () => focus.on }));

import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';

import type { AccountServices } from '../account-services';
import { usePassSaved } from '../use-account';

describe('usePassSaved', () => {
  it('reads again when the screen regains focus', async () => {
    let saved = false;
    const services = { passSaved: () => Promise.resolve(saved) } as unknown as AccountServices;
    focus.on = true;
    const hook = await renderHook(() => usePassSaved(services));
    await act(async () => {
      await Promise.resolve();
    });
    expect(hook.result.current).toBe(false);

    // A page is pushed over the screen and the pass is saved there.
    focus.on = false;
    await hook.rerender({});
    saved = true;
    focus.on = true;
    await hook.rerender({});
    await act(async () => {
      await Promise.resolve();
    });
    expect(hook.result.current).toBe(true);
  });
});
