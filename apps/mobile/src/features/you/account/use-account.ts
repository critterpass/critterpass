/** The account's server state and whether the pass is saved, read once when a screen opens. */
import { useEffect, useState, useSyncExternalStore } from 'react';

import type { AccountRead } from './account-api';
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
export function accountRows(
  read: AccountRead | null,
): 'ready' | 'checking' | 'unreachable' | 'none' {
  if (read === null) return 'checking';
  if (read.kind === 'ok') return 'ready';
  return read.kind === 'signed_out' ? 'none' : 'unreachable';
}

/** `null` until known. A session that cannot be read counts as unsaved: the warning shows. */
export function usePassSaved(services: AccountServices): boolean | null {
  const [saved, setSaved] = useState<boolean | null>(null);
  useEffect(() => {
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
  }, [services]);
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
