/**
 * `useRefusedMoneyWrites()`: says so when the server refuses a queued money write. Each refusal is
 * a toast that stays up long enough to read (what was not saved, and why), told once. A write made
 * while online is then cleared from the refusal list; one that waited with no signal stays for the
 * trip's "didn't go through" list, which keeps it until it is read there.
 */
/* eslint-disable lingui/no-unlocalized-strings -- toast keys, never copy. */
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { dismissRejected } from '@/data/status/use-rejected-commands';
import { impact } from '@/motion';
import { toast } from '@/motion/island-toast';

import { useLiveRows } from './live-rows';
import {
  REFUSED_MONEY_SQL,
  REFUSED_MONEY_TABLES,
  toRefusedMoneyWrite,
  type RefusedMoneyRow,
} from './refused-writes';

const NO_PARAMS: readonly unknown[] = [];

/** Refusals already said in this run of the app, wherever the hook is mounted. */
const told = new Set<string>();

export function useRefusedMoneyWrites(): void {
  const { db } = useLocalFirst();
  const { i18n } = useLingui();
  const { rows } = useLiveRows<RefusedMoneyRow>(REFUSED_MONEY_SQL, NO_PARAMS, REFUSED_MONEY_TABLES);

  useEffect(() => {
    for (const row of rows) {
      const refusal = toRefusedMoneyWrite(row);
      if (!told.has(refusal.opId)) {
        told.add(refusal.opId);
        impact('error');
        toast.show({
          id: `money-refused-${refusal.opId}`,
          title: i18n._(refusal.title),
          subtitle: i18n._(refusal.reason),
          linger: true,
        });
      }
      if (!refusal.keptForTrip) void dismissRejected(db, refusal.opId).catch(() => undefined);
    }
  }, [rows, db, i18n]);
}
