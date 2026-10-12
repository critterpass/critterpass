/**
 * A pass saved to an account on this phone, remembered where a reinstall can still see it: the
 * iOS keychain outlives the app, so a fresh install that finds the mark greets "Welcome back" and
 * offers sign-in first (2.02), even without signal. Android clears app storage on uninstall, so
 * there the splash stays the first-launch one. Only a timestamp is kept, never who.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a storage key, never copy. */
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

const KEY = 'cp.returning_install';

/** Marks this phone as having held a saved pass. Best effort: a failure only loses the greeting. */
export function markReturningInstall(): void {
  try {
    void SecureStore.setItemAsync(KEY, new Date().toISOString(), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    }).catch(() => undefined);
  } catch {
    // A build or test without the keychain module: nothing to remember with.
  }
}

/** Whether a saved pass was on this phone before (null while it is being read). */
export function useReturningInstall(): boolean | null {
  const [found, setFound] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => SecureStore.getItemAsync(KEY))
      .then((value) => {
        if (live) setFound(value !== null);
      })
      .catch(() => {
        if (live) setFound(false);
      });
    return () => {
      live = false;
    };
  }, []);
  return found;
}
