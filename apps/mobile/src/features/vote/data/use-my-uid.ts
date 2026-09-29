/** The signed-in uid as the local database knows it (its bound owner); null until bound. */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { useLiveRows } from './live-rows';

const SQL = 'SELECT value FROM local_state WHERE id = ?';
const TABLES = ['local_state'];

export function useMyUid(): string | null {
  const { rows } = useLiveRows<{ value: string }>(SQL, [OWNER_UID_KEY], TABLES);
  return rows[0]?.value ?? null;
}
