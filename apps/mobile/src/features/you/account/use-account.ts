/** The account's server state and whether the pass is saved, read once when a screen opens. */
import { useEffect, useState, useSyncExternalStore } from 'react';

import type { AccountRead } from './account-api';
import type { AccountServices } from './account-services';

/** `null` until the server has answered. */
export function useAccountRead(services: AccountServices): AccountRead | null {
  const [read, setRead] = useState<AccountRead | null>(null);
  useEffect(() => {
    let live = true;
    void services.readAccount().then((next) => {
      if (live) setRead(next);
    });
    return () => {
      live = false;
    };
  }, [services]);
  return read;
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
