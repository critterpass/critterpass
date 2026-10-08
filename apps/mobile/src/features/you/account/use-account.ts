/** The account's server state and whether the pass is saved, read once when a screen opens. */
import { useIsFocused } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';

import type { AccountRead } from './account-api';
import type { AccountRowsState } from '../settings/account-rows';
import type { AccountServices } from './account-services';

/**
 * `null` until the server has answered. Pass `online` to ask again each time signal returns, so an
 * answer missed offline does not stay missed for as long as the screen is open.
 */
export function useAccountRead(services: AccountServices, online = true): AccountRead | null {
  const [read, setRead] = useState<AccountRead | null>(null);
  useEffect(() => {
    if (!online) return undefined;
    let live = true;
    void services.readAccount().then((next) => {
      if (live) setRead(next);
    });
    return () => {
      live = false;
    };
  }, [services, online]);
  return online ? read : (read ?? { kind: 'unavailable' });
}

/** How Settings draws the account rows for an account read (see `SettingsValues.account`). */
export function accountRows(read: AccountRead | null): AccountRowsState {
  if (read === null) return 'checking';
  if (read.kind === 'ok') return 'ready';
  return read.kind === 'signed_out' ? 'none' : 'unreachable';
}

/**
 * `null` until known. A session that cannot be read counts as unsaved: the warning shows. Read
 * again each time the screen comes back to the front: the pass can be saved from a page pushed
 * over it, and the warning must not outlive that.
 */
export function usePassSaved(services: AccountServices): boolean | null {
  const [saved, setSaved] = useState<boolean | null>(null);
  const focused = useIsFocused();
  useEffect(() => {
    if (!focused) return undefined;
    let live = true;
    void services
      .passSaved()
      .catch(() => false)
      .then((next) => {
        if (live) setSaved(next);
      });
    return () => {
      live = false;
    };
  }, [services, focused]);
  return saved;
}

/** Live connectivity as the local-first stack sees it. */
export function useOnline(network: {
  isOnline(): boolean;
  subscribe(listener: (online: boolean) => void): () => void;
}): boolean {
  return useSyncExternalStore(
    (listener) => network.subscribe(listener),
    () => network.isOnline(),
  );
}
