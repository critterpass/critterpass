/**
 * The one place the app destroys things, so its guard rails are pinned here: an unsaved pass sees
 * the warning before it can sign out; deleting needs the hold, is off while offline, and never
 * clears the phone unless the server said the account is closed; the Account rows exist only when
 * the server answered; signing out and Start fresh clear the phone through the same routine.
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
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  usePathname: () => '/you/settings',
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true },
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { SendResult } from '@/data/commands/client';
import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import { AnalyticsProvider, type AnalyticsClient } from '@/lib/analytics';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { MMKV_STORES, startFresh, type StartFreshPorts } from '@/lib/dev-tools/start-fresh';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { SettingsScreen } from '../../settings/settings-screen';
import type { AccountRead } from '../account-api';
import { AccountClosedGate } from '../account-closed-gate';
import { isSavedPass, type AccountServices } from '../account-services';
import { clearThisPhone, type PhonePorts } from '../clear-phone';
import { closeAccount } from '../close-account';
import { DeleteScreen } from '../delete-screen';
import { DeleteView } from '../delete-view';
import { SignOutScreen } from '../sign-out-screen';

configure({ asyncUtilTimeout: 5000 });

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const stacks: TestLocalFirst[] = [];

afterEach(async () => {
  jest.clearAllMocks();
  for (const stack of stacks.splice(0)) {
    await stack.close();
    removeDir(stack.dir);
  }
});

/** PostHog is the network boundary: no flag is on and nothing is sent. */
const analytics = new Proxy(
  { posthog: { getFeatureFlag: () => undefined, onFeatureFlags: () => () => undefined } },
  { get: (target, key) => (key in target ? target[key as keyof typeof target] : () => undefined) },
) as unknown as AnalyticsClient;

async function show(ui: ReactElement, stack?: TestLocalFirst) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const inner = <ScreenJoltProvider>{ui}</ScreenJoltProvider>;
  await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>
          <AnalyticsProvider client={analytics}>
            {stack ? <LocalFirstProvider value={stack.value}>{inner}</LocalFirstProvider> : inner}
          </AnalyticsProvider>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
}

async function openStack(): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  return stack;
}

function services(over: Partial<AccountServices> = {}): AccountServices & {
  clearPhone: jest.Mock<AccountServices['clearPhone']>;
} {
  return {
    readAccount: () =>
      Promise.resolve({ kind: 'ok', state: { status: 'registered', deletion: null } }),
    passSaved: () => Promise.resolve(true),
    ...over,
    clearPhone: jest.fn<AccountServices['clearPhone']>(() =>
      Promise.resolve({ kind: 'restarting' }),
    ),
  };
}

describe('sign out', () => {
  it('counts a pass as saved only when there is a way back in', () => {
    expect(isSavedPass(null)).toBe(false);
    expect(isSavedPass({ isAnonymous: true, phoneNumber: null })).toBe(false);
    expect(isSavedPass({ isAnonymous: true, phoneNumber: '+6591234567' })).toBe(true);
    expect(isSavedPass({ isAnonymous: false })).toBe(true);
  });

  it('shows an unsaved pass the warning, with saving first and signing out on purpose', async () => {
    const svc = services({ passSaved: () => Promise.resolve(false) });
    await show(<SignOutScreen services={svc} />);
    await waitFor(() => expect(screen.getByTestId('you-sign-out-warning')).toBeTruthy());
    // The plain confirm of a saved pass is not offered at all.
    expect(screen.queryByTestId('you-sign-out-confirm')).toBeNull();
    await fireEvent.press(screen.getByTestId('you-sign-out-save'));
    expect(router.push).toHaveBeenCalledWith('/onboarding/save');
    expect(svc.clearPhone).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('you-sign-out-erase'));
    await waitFor(() => expect(svc.clearPhone).toHaveBeenCalledWith('sign_out'));
  });

  it('offers nothing to confirm until it knows whether the pass is saved', async () => {
    const svc = services({ passSaved: () => new Promise<boolean>(() => undefined) });
    await show(<SignOutScreen services={svc} />);
    expect(screen.getByTestId('you-sign-out-loading')).toBeTruthy();
    expect(screen.queryByTestId('you-sign-out-confirm')).toBeNull();
    expect(screen.queryByTestId('you-sign-out-erase')).toBeNull();
  });

  it('treats a session it cannot read as unsaved', async () => {
    const svc = services({ passSaved: () => Promise.reject(new Error('no session')) });
    await show(<SignOutScreen services={svc} />);
    await waitFor(() => expect(screen.getByTestId('you-sign-out-warning')).toBeTruthy());
  });

  it('signs a saved pass out and says so when the phone could not be cleared', async () => {
    const svc = services();
    svc.clearPhone.mockResolvedValueOnce({ kind: 'incomplete' });
    await show(<SignOutScreen services={svc} />);
    await waitFor(() => expect(screen.getByTestId('you-sign-out-confirm')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('you-sign-out-confirm'));
    await waitFor(() => expect(screen.getByTestId('you-sign-out-problem')).toBeTruthy());
    expect(svc.clearPhone).toHaveBeenCalledWith('sign_out');
  });
});

describe('delete account', () => {
  const applied: SendResult = {
    kind: 'applied',
    opId: 'op',
    result: { purge_at: '2026-10-31T00:00:00.000Z', instant: false },
  };

  it('counts the account closed only on the server’s own answer', async () => {
    expect(await closeAccount(() => Promise.resolve(applied), 'privacy')).toEqual({
      kind: 'closed',
      account: { purgeAt: '2026-10-31T00:00:00.000Z' },
    });
    const instant: SendResult = { ...applied, result: { purge_at: 'x', instant: true } };
    expect(await closeAccount(() => Promise.resolve(instant), null)).toEqual({
      kind: 'closed',
      account: { purgeAt: null },
    });
    for (const result of [
      { kind: 'queued', opId: 'op' },
      { kind: 'rejected', opId: 'op', code: 'FORBIDDEN' },
      { kind: 'unavailable', opId: 'op', code: 'NETWORK' },
    ] as SendResult[]) {
      expect(await closeAccount(() => Promise.resolve(result), null)).toEqual({
        kind: 'not_closed',
      });
    }
    expect(await closeAccount(() => Promise.reject(new Error('boom')), null)).toEqual({
      kind: 'not_closed',
    });
  });

  it('sends the reason only when one was picked', async () => {
    const send = jest.fn((payload: object) => {
      void payload;
      return Promise.resolve(applied);
    });
    await closeAccount(send, null);
    await closeAccount(send, 'too_many_pings');
    expect(send.mock.calls).toEqual([[{}], [{ reason: 'too_many_pings' }]]);
  });

  function deleteView(over: { online?: boolean; step?: 'review' | 'hold' } = {}) {
    const onDelete = jest.fn();
    const ui = (
      <DeleteView
        step={over.step ?? 'hold'}
        online={over.online ?? true}
        busy={false}
        passPlus={false}
        reason={null}
        problem={null}
        onContinue={jest.fn()}
        onReason={jest.fn()}
        onDelete={onDelete}
        onKeep={jest.fn()}
      />
    );
    return { ui, onDelete };
  }

  it('has no control that deletes on a plain tap: only the hold', async () => {
    const { ui, onDelete } = deleteView();
    await show(ui);
    for (const id of [
      'you-delete-hold',
      'you-delete-keep',
      'you-delete-back',
      'you-delete-reason-privacy',
    ]) {
      await fireEvent.press(screen.getByTestId(id));
    }
    expect(onDelete).not.toHaveBeenCalled();
    // The review step has no hold yet at all.
    const review = deleteView({ step: 'review' });
    await show(review.ui);
    expect(screen.queryByTestId('you-delete-hold')).toBeNull();
  });

  it('turns the hold off while offline and says why', async () => {
    const { ui } = deleteView({ online: false });
    await show(ui);
    const hold = screen.getByTestId('you-delete-hold');
    expect(hold.props.accessibilityState).toEqual({ disabled: true });
    expect(hold.props.accessibilityActions).toEqual([]);
    expect(screen.getByTestId('you-delete-offline')).toBeTruthy();
  });

  it('leaves the phone untouched and says so when the server does not close the account', async () => {
    // The test stack's server is unreachable: the command comes back `unavailable`.
    const stack = await openStack();
    const svc = services();
    await show(<DeleteScreen services={svc} />, stack);
    await fireEvent.press(screen.getByTestId('you-delete-continue'));
    const hold = await screen.findByTestId('you-delete-hold');
    // Completing the hold, through the ring's own accessible path: activate, then confirm.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await fireEvent(hold, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    const confirm = buttons.find((button) => button.style === 'destructive');
    expect(confirm).toBeDefined();
    await act(() => {
      confirm?.onPress?.();
    });
    await waitFor(() => expect(screen.getByTestId('you-delete-problem')).toBeTruthy());
    expect(svc.clearPhone).not.toHaveBeenCalled();
    expect(screen.queryByTestId('you-closed-closed')).toBeNull();
  });
});

describe('settings account section', () => {
  it.each<[string, AccountRead]>([
    ['the server has no such route or cannot be reached', { kind: 'unavailable' }],
    ['the session is gone', { kind: 'signed_out' }],
  ])('is not drawn when %s', async (_name, read) => {
    await show(
      <SettingsScreen services={services({ readAccount: () => Promise.resolve(read) })} />,
      await openStack(),
    );
    await waitFor(() => expect(screen.getByTestId('you-settings-app')).toBeTruthy());
    expect(screen.queryByTestId('you-settings-account')).toBeNull();
  });

  it('is drawn once the server has answered for the account', async () => {
    await show(<SettingsScreen services={services()} />, await openStack());
    await waitFor(() => expect(screen.getByTestId('you-settings-account')).toBeTruthy());
  });
});

describe('the closed-account gate', () => {
  it('sends a closed account to the restore page and leaves an open one alone', async () => {
    const stack = await openStack();
    const closed = services({
      readAccount: () =>
        Promise.resolve({
          kind: 'ok',
          state: {
            status: 'closed',
            deletion: {
              requested_at: '2026-10-01T00:00:00.000Z',
              purge_at: '2026-10-31T00:00:00.000Z',
            },
          },
        }),
    });
    await show(<AccountClosedGate services={closed} resumeSignIn={() => false} />, stack);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/account-closed'));

    jest.clearAllMocks();
    await show(<AccountClosedGate services={services()} resumeSignIn={() => false} />, stack);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens the sign-in on the launch after "keep my account"', async () => {
    await show(<AccountClosedGate services={services()} resumeSignIn={() => true} />);
    expect(router.push).toHaveBeenCalledWith('/onboarding/phone?mode=returning');
  });
});

describe('clearing the phone', () => {
  function ports() {
    const calls: string[] = [];
    const cleared: (string | null)[] = [];
    const value: PhonePorts = {
      signOut: (sessionStillOnServer) => {
        calls.push(`signOut:${String(sessionStillOnServer)}`);
        return Promise.resolve();
      },
      forgetSessions: () => Promise.resolve(void calls.push('forgetSessions')),
      forgetInstallId: () => Promise.resolve(void calls.push('forgetInstallId')),
      deleteSecureItem: () => Promise.resolve(),
      cancelNotificationsAndAlarms: () => Promise.resolve(void calls.push('notifications')),
      deleteFiles: () => Promise.resolve(),
      openStore: (id) => {
        cleared.push(id);
        return { getAllKeys: () => [], remove: () => undefined };
      },
      reload: () => Promise.resolve(void calls.push('reload')),
    };
    return { value, calls, cleared };
  }

  it('signs out on the server for a sign-out, and makes no call on a closed account’s session', async () => {
    const signOut = ports();
    expect(await clearThisPhone(signOut.value, 'sign_out')).toEqual({ kind: 'restarting' });
    expect(signOut.calls[0]).toBe('signOut:true');
    const closed = ports();
    await clearThisPhone(closed.value, 'account_closed');
    expect(closed.calls[0]).toBe('signOut:false');
  });

  it('clears every store Start fresh clears, in the same order, and restarts last', async () => {
    const mine = ports();
    let marked = false;
    await clearThisPhone(mine.value, 'sign_out', {
      beforeRestart: () => {
        // Everything is already cleared when the mark is written.
        expect(mine.cleared).toHaveLength(MMKV_STORES.filter((store) => store.cleared).length);
        marked = true;
      },
    });
    expect(marked).toBe(true);
    expect(mine.cleared).toEqual(
      MMKV_STORES.filter((store) => store.cleared).map((store) => store.id),
    );
    expect(mine.calls.at(-1)).toBe('reload');

    // Start fresh, over the very same ports.
    const theirs = ports();
    const full: StartFreshPorts = {
      ...theirs.value,
      eraseAccount: () => Promise.resolve('erased'),
    };
    await startFresh(full, { leaveAccountOnServer: false });
    expect(theirs.cleared).toEqual(mine.cleared);
    expect(theirs.calls.slice(1)).toEqual(mine.calls.slice(1));
  });

  it('reports a phone it could not fully clear, and does not restart', async () => {
    const broken = ports();
    const value: PhonePorts = {
      ...broken.value,
      forgetSessions: () => Promise.reject(new Error('keychain locked')),
    };
    expect(await clearThisPhone(value, 'sign_out')).toEqual({ kind: 'incomplete' });
    expect(broken.calls).not.toContain('reload');
  });
});
