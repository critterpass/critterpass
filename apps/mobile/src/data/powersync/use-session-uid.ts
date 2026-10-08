/**
 * The signed-in uid, synchronously: the uid the session bound the local database to. It is there
 * on a screen's first render once the session is up, and follows the database's owner through a
 * sign-out (null) and the next sign-in. Null before the session has opened the database.
 */
import { useCallback, useContext, useSyncExternalStore } from 'react';

import { LocalFirstContext } from './local-first-context';
import { sessionUid, subscribeSessionUid } from './session-uid-store';

const noSubscription = () => undefined;

export function useSessionUid(): string | null {
  const db = useContext(LocalFirstContext)?.db ?? null;
  const subscribe = useCallback(
    (listener: () => void) => (db === null ? noSubscription : subscribeSessionUid(db, listener)),
    [db],
  );
  return useSyncExternalStore(subscribe, () => (db === null ? null : sessionUid(db)));
}
