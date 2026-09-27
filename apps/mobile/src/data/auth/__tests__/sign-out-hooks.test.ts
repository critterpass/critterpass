import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  registerOnSignOut,
  resetOnSignOutHooksForTests,
  runOnSignOutHooks,
  type OnSignOutHook,
} from '../sign-out-hooks';

afterEach(() => resetOnSignOutHooksForTests());

describe('sign-out hook registry', () => {
  it('runs every registered hook, in registration order, awaiting each before the next', async () => {
    const order: string[] = [];
    registerOnSignOut(async () => {
      await Promise.resolve();
      order.push('a');
    });
    registerOnSignOut(() => {
      order.push('b');
    });

    await runOnSignOutHooks();
    expect(order).toEqual(['a', 'b']);
  });

  it('running with no registered hooks is a no-op', async () => {
    await expect(runOnSignOutHooks()).resolves.toBeUndefined();
  });

  it('resetOnSignOutHooksForTests clears the registry', async () => {
    const hook = jest.fn<OnSignOutHook>();
    registerOnSignOut(hook);
    resetOnSignOutHooksForTests();
    await runOnSignOutHooks();
    expect(hook).not.toHaveBeenCalled();
  });
});
