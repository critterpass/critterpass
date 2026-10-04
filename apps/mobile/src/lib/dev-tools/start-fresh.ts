/**
 * "Start fresh" (Developer tools): this phone becomes a brand-new user without a reinstall. On iOS
 * a reinstall keeps the Keychain, so the old session and ids would survive it.
 *
 * This file is the list of what an account leaves on the phone, with what happens to each entry,
 * and the order the wipe runs in. The device wiring (SecureStore, MMKV, files, notifications) is
 * passed in by the Developer tools screen, which is the only importer: release bundles never
 * contain a caller.
 */

/** A SecureStore (Keychain / Keystore) item. */
export interface SecureItem {
  readonly key: string;
  readonly cleared: boolean;
  readonly why: string;
}

/**
 * Beside these, `StartFreshPorts.forgetSessions` removes the items whose keys the data layer owns:
 * the auth client's cookie and session cache (chunked), the kept test accounts, and the device
 * action key the notification extensions sign with. `forgetInstallId` removes the install's id
 * and the item earlier builds kept a second id in, so the next launch mints exactly one new id.
 */
export const SECURE_ITEMS: readonly SecureItem[] = [
  { key: 'cp.attest.key_id', cleared: true, why: 'attested for the old install id' },
  {
    key: 'cp.local-db.key',
    cleared: false,
    why: 'opens the local database file, which stays on disk emptied; without it the app cannot start',
  },
];

/** An MMKV store; `id: null` is the default store. */
export interface MmkvStore {
  readonly id: string | null;
  readonly cleared: boolean;
  /** Keys that survive when the rest of the store is cleared. */
  readonly keep?: readonly string[];
  readonly why: string;
}

export const MMKV_STORES: readonly MmkvStore[] = [
  {
    id: null,
    cleared: true,
    why: 'first-launch hatch, saved navigation, language, motion, sound and accessibility choices',
  },
  { id: 'cp-app-session', cleared: true, why: 'the last signed-in uid and its reported language' },
  { id: 'cp-critters-hatch', cleared: true, why: 'which eggs this account has seen hatch' },
  { id: 'cp-critters-slipped', cleared: true, why: 'which slipped-away finds were put away' },
  {
    id: 'cp-links',
    cleared: true,
    keep: ['cp.links.deferred_checked'],
    why: 'a pending invite and the onboarded flag go; the once-per-install link check stays done, or the invite that installed the app would be claimed again',
  },
  {
    id: 'cp-live-activities',
    cleared: false,
    why: 'push-to-start tokens: iOS hands each out once per install, and every launch sends them again for the signed-in account',
  },
  { id: 'cp-location-prefs', cleared: true, why: 'location and visit prompt choices' },
  {
    id: 'cp-map-regions',
    cleared: false,
    why: 'which destinations have a published region pack: a fact about the tiles host, the same for every account',
  },
  { id: 'cp-onboarding', cleared: true, why: 'the pass draft: name, photo, guide, tastes' },
  { id: 'cp-planning-switch', cleared: true, why: 'the planning rollout switch and plan hub' },
  { id: 'cp-permissions', cleared: true, why: 'when each primer was declined; OS grants stay' },
  { id: 'cp-permissions-mirror', cleared: true, why: 'what was last reported to the server' },
  { id: 'cp-realtime', cleared: true, why: 'chat channel positions of the old account' },
  {
    id: 'cp-search',
    cleared: true,
    why: 'imported link hashes and plain-words questions asked offline',
  },
  {
    id: 'cp-server-flags',
    cleared: true,
    why: 'the flag values the api last gave the old account',
  },
  { id: 'cp-setup-calendar', cleared: true, why: 'calendar choices from trip setup' },
  { id: 'cp-travel-data', cleared: true, why: 'last good weather, fares and insights answers' },
  {
    id: 'cp-explore-swipes',
    cleared: true,
    why: 'what this phone swiped in a group swipe session',
  },
  {
    id: 'cp-updates',
    cleared: false,
    why: 'the update the app last restarted itself for: forgetting it could restart for a failing update again',
  },
];

/** A directory, or the files in a root whose names start with `prefix`. */
export interface FileTarget {
  readonly root: 'document' | 'cache';
  readonly name: string;
  readonly match: 'directory' | 'prefix';
  readonly cleared: boolean;
  readonly why: string;
}

export const FILE_TARGETS: readonly FileTarget[] = [
  {
    root: 'document',
    name: 'media',
    match: 'directory',
    cleared: true,
    why: 'saved chat photos and videos',
  },
  {
    root: 'document',
    name: 'bookings',
    match: 'directory',
    cleared: true,
    why: 'booking documents',
  },
  {
    root: 'document',
    name: 'trip-days',
    match: 'directory',
    cleared: true,
    why: 'offline trip bundles',
  },
  {
    root: 'cache',
    name: 'stickers',
    match: 'directory',
    cleared: true,
    why: 'rendered stickers and avatars',
  },
  { root: 'cache', name: 'ImagePicker', match: 'directory', cleared: true, why: 'picked photos' },
  { root: 'cache', name: 'critter-', match: 'prefix', cleared: true, why: 'shared critter cards' },
  {
    root: 'document',
    name: 'phrase_audio',
    match: 'directory',
    cleared: false,
    why: 'guide phrase audio is the same for everyone',
  },
  {
    root: 'document',
    name: 'cp-regions',
    match: 'directory',
    cleared: false,
    why: 'offline place packs are public data and large to download again',
  },
];

export interface MmkvPort {
  getAllKeys(): string[];
  remove(key: string): unknown;
}

/** What the server did with the account (./erase-account.ts). */
export type EraseOutcome =
  /** Erased, every session ended: no further call may be made on the old session. */
  | 'erased'
  /** The server has no such call yet: the account stays there. */
  | 'unavailable'
  /** This phone holds no valid session, so there is nothing it can erase. */
  | 'signed_out';

export interface StartFreshPorts {
  /**
   * Erases the caller's account on the server before anything on the phone is touched. Throws
   * when the server refuses or cannot be reached: the whole action then stops.
   */
  readonly eraseAccount: () => Promise<EraseOutcome>;
  /**
   * Runs the sign-out cleanup (local database, command queue, analytics identity), after signing
   * out on the server when the account, and its session with it, is still there.
   */
  readonly signOut: (sessionStillOnServer: boolean) => Promise<void>;
  /** Removes the auth client's stored session, every kept test account and the device action key. */
  readonly forgetSessions: () => Promise<void>;
  /** Removes the install id the server knows the account by, in both items it may live in. */
  readonly forgetInstallId: () => Promise<void>;
  readonly deleteSecureItem: (item: SecureItem) => Promise<void>;
  /** Scheduled local notifications, delivered ones, the badge and leave-by alarms. */
  readonly cancelNotificationsAndAlarms: () => Promise<void>;
  readonly deleteFiles: (target: FileTarget) => Promise<void>;
  readonly openStore: (id: string | null) => MmkvPort;
  /** Restarts the JS so the app comes up as a first launch. */
  readonly reload: () => Promise<void>;
}

export interface StartFreshOptions {
  /**
   * Whether to go on when the server did not erase the account (`unavailable`, `signed_out`): the
   * phone still becomes a new person, and the old account stays on the server. Asked for
   * explicitly, after the person has been told.
   */
  readonly leaveAccountOnServer: boolean;
}

export type StartFreshResult =
  | { readonly kind: 'restarting' }
  /** The server refused or could not be reached: nothing on the phone was touched. */
  | { readonly kind: 'server_failed'; readonly message: string }
  /** The account would stay on the server and nobody agreed to that yet: nothing was touched. */
  | { readonly kind: 'account_would_stay'; readonly why: 'unavailable' | 'signed_out' }
  /** Some of the phone could not be cleared; the action is safe to run again. */
  | { readonly kind: 'incomplete'; readonly failed: readonly string[] }
  /** The phone is cleared but the JS would not restart: closing and opening the app does it. */
  | { readonly kind: 'restart_failed'; readonly message: string };

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function startFresh(
  ports: StartFreshPorts,
  options: StartFreshOptions,
): Promise<StartFreshResult> {
  let erased: EraseOutcome;
  try {
    erased = await ports.eraseAccount();
  } catch (error) {
    return { kind: 'server_failed', message: messageOf(error) };
  }
  if (erased !== 'erased' && !options.leaveAccountOnServer) {
    return { kind: 'account_would_stay', why: erased };
  }

  const failed: string[] = [];
  const attempt = async (what: string, run: () => Promise<void> | void) => {
    try {
      await run();
    } catch (error) {
      failed.push(`${what}: ${messageOf(error)}`);
    }
  };

  await attempt('sign out', () => ports.signOut(erased === 'unavailable'));
  await attempt('stored sessions', ports.forgetSessions);
  await attempt('install id', ports.forgetInstallId);
  for (const item of SECURE_ITEMS) {
    if (item.cleared) await attempt(item.key, () => ports.deleteSecureItem(item));
  }
  await attempt('notifications and alarms', ports.cancelNotificationsAndAlarms);
  for (const target of FILE_TARGETS) {
    if (target.cleared) await attempt(target.name, () => ports.deleteFiles(target));
  }
  // Last, right before the restart: nothing still running gets the time to write them back.
  for (const store of MMKV_STORES) {
    if (!store.cleared) continue;
    await attempt(store.id ?? 'default store', () => {
      const mmkv = ports.openStore(store.id);
      for (const key of mmkv.getAllKeys()) {
        if (store.keep?.includes(key) !== true) mmkv.remove(key);
      }
    });
  }

  if (failed.length > 0) return { kind: 'incomplete', failed };
  try {
    await ports.reload();
  } catch (error) {
    return { kind: 'restart_failed', message: messageOf(error) };
  }
  return { kind: 'restarting' };
}
