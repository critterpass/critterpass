import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { signOut, type SignOutClient } from '../sign-out';
import {
  registerOnSignOut,
  resetOnSignOutHooksForTests,
  type OnSignOutHook,
} from '../sign-out-hooks';

afterEach(() => resetOnSignOutHooksForTests());

function fakeSignOutClient(response: Awaited<ReturnType<SignOutClient['signOut']>>) {
  const signOutFn = jest.fn<SignOutClient['signOut']>().mockResolvedValue(response);
  const client: SignOutClient = { signOut: signOutFn };
  return { client, signOutFn };
}

describe('signOut', () => {
  it('runs every registered onSignOut hook, in order, after a successful sign-out', async () => {
    const order: string[] = [];
    registerOnSignOut(() => {
      order.push('powersync-disconnect');
    });
    registerOnSignOut(() => {
      order.push('local-private-wipe');
      return Promise.resolve();
    });
    const { client } = fakeSignOutClient({ data: {}, error: null });

    const result = await signOut(client);
    expect(result).toEqual({ signedOut: true });
    expect(order).toEqual(['powersync-disconnect', 'local-private-wipe']);
  });

  it('never runs a hook when the server rejects the sign-out', async () => {
    const hook = jest.fn<OnSignOutHook>();
    registerOnSignOut(hook);
    const { client } = fakeSignOutClient({ data: null, error: { code: 'BOOM' } });

    const result = await signOut(client);
    expect(result).toEqual({ signedOut: false });
    expect(hook).not.toHaveBeenCalled();
  });
});
