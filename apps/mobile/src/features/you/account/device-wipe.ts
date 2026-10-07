/**
 * The one wiring of what clearing this phone touches: the stored session, the install id,
 * SecureStore items, files, MMKV stores, notifications and alarms, and the restart. Signing out,
 * closing an account and Developer tools' "Start fresh" all run `startFresh` over these same
 * ports, so a store added to its lists is cleared by all three. Leave-by alarms are cancelled
 * through the port a route hands over (native modules are loaded by routes, not features).
 */
/* eslint-disable lingui/no-unlocalized-strings -- storage keys, never copy. */
import { Directory, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import { DevSettings } from 'react-native';
import { createMMKV } from 'react-native-mmkv';

import { createDevSlots } from '@/data/auth/dev-slots';
import { runOnSignOutHooks } from '@/data/auth/sign-out-hooks';
import { secureActionKeyStorage } from '@/data/push/expo-native';
import { INSTALL_ID_ITEM, LEGACY_ENVELOPE_ID_ITEM } from '@/data/push/register';
import type { FileTarget, StartFreshPorts } from '@/lib/dev-tools/start-fresh';
import { markInAppRestart } from '@/lib/links/launch-replay';

export interface AlarmCanceller {
  list(): Promise<readonly { readonly leaveById: string }[]>;
  cancel(leaveById: string): Promise<unknown>;
}

let alarms: AlarmCanceller | null = null;

/** Called by the route layouts that can end in a cleared phone. */
export function provideAlarmCanceller(port: AlarmCanceller | null): void {
  alarms = port;
}

async function signOutHere(sessionStillOnServer: boolean): Promise<void> {
  if (sessionStillOnServer) {
    const { deviceAuth } = await import('@/data/app-session/device-session');
    const signedOut = await deviceAuth()
      .signOut()
      .then((result) => result.signedOut)
      .catch(() => false);
    // A confirmed sign-out has already run the cleanup.
    if (signedOut) return;
  }
  await runOnSignOutHooks();
}

async function forgetSessions(): Promise<void> {
  // The sign-out cleanup already ran: only the stored session and its cache are left to remove.
  const slots = createDevSlots(SecureStore, () => Promise.resolve());
  await slots.clear();
  await slots.switchTo(null);
  await secureActionKeyStorage.remove();
}

async function forgetInstallId(): Promise<void> {
  await SecureStore.deleteItemAsync(INSTALL_ID_ITEM);
  await SecureStore.deleteItemAsync(LEGACY_ENVELOPE_ID_ITEM);
}

async function cancelNotificationsAndAlarms(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.dismissAllNotificationsAsync();
  await Notifications.setBadgeCountAsync(0);
  if (alarms === null) return;
  for (const alarm of await alarms.list()) await alarms.cancel(alarm.leaveById);
}

function deleteFiles(target: FileTarget): Promise<void> {
  const root = target.root === 'document' ? Paths.document : Paths.cache;
  if (target.match === 'directory') {
    const directory = new Directory(root, target.name);
    if (directory.exists) directory.delete();
    return Promise.resolve();
  }
  for (const entry of new Directory(root).list()) {
    if (entry.name.startsWith(target.name)) entry.delete();
  }
  return Promise.resolve();
}

async function reload(): Promise<void> {
  // After the stores are wiped: the link this process was opened with is not followed again.
  markInAppRestart();
  if (__DEV__) {
    DevSettings.reload();
    return;
  }
  await Updates.reloadAsync();
}

/** Everything but what the server is asked to do first, which each caller decides. */
export const deviceWipePorts: Omit<StartFreshPorts, 'eraseAccount'> = {
  signOut: signOutHere,
  forgetSessions,
  forgetInstallId,
  deleteSecureItem: (item) => SecureStore.deleteItemAsync(item.key),
  cancelNotificationsAndAlarms,
  deleteFiles,
  openStore: (id) => (id === null ? createMMKV() : createMMKV({ id })),
  reload,
};

const RESUME_SIGN_IN_KEY = 'cp.you.resume_sign_in';

/**
 * Written after the stores are cleared and right before the restart, so the fresh launch opens the
 * sign-in for someone who wants a closed account back, instead of leaving them at the welcome
 * screen to find it.
 */
export function markResumeSignIn(): void {
  createMMKV().set(RESUME_SIGN_IN_KEY, true);
}

/** True once per mark: reading it clears it. */
export function takeResumeSignIn(): boolean {
  const store = createMMKV();
  const marked = store.getBoolean(RESUME_SIGN_IN_KEY) === true;
  if (marked) store.remove(RESUME_SIGN_IN_KEY);
  return marked;
}
