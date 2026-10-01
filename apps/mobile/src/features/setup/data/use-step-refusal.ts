/**
 * A step move the server refused after the app had already moved on. `set_setup_step` works
 * offline, so the app shows the next step at once and the server's answer arrives later; when it
 * is a refusal (the step is not one this crew may leave yet), the entry stays in the "didn't go
 * through" list until the person has been put back and has moved again, so it survives the screen
 * being replaced.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useCallback } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import { useLiveRows } from './rows';

const REFUSED_SQL = `SELECT id FROM rejected_commands WHERE cmd = 'set_setup_step'
  ORDER BY rejected_at DESC`;
const TABLES = ['rejected_commands'];

export function useStepRefusal(): {
  /** A step move was refused and has not been acknowledged by moving again. */
  readonly refused: boolean;
  readonly acknowledge: () => void;
} {
  const { db } = useLocalFirst();
  const rows = useLiveRows<{ id: string }>(REFUSED_SQL, [], TABLES);
  const acknowledge = useCallback(() => {
    void db
      .execute("DELETE FROM rejected_commands WHERE cmd = 'set_setup_step'")
      .catch(() => undefined);
  }, [db]);
  return { refused: rows.rows.length > 0, acknowledge };
}
