/**
 * The signed-in uid as the local database knows it (the owner it was bound to at sign-in), so chat
 * hooks can tell "mine" from "theirs" without waiting on the auth layer. Null until bound.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useEffect, useState } from 'react';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { watchRows } from '@/data/status/watch-rows';

export function useMyUid(): string | null {
  const { db } = useLocalFirst();
  const [uid, setUid] = useState<string | null>(null);
  useEffect(
    () =>
      watchRows<{ value: string }>(
        db,
        `SELECT value FROM local_state WHERE id = '${OWNER_UID_KEY}'`,
        ['local_state'],
        (rows) => setUid(rows[0]?.value ?? null),
      ),
    [db],
  );
  return uid;
}
