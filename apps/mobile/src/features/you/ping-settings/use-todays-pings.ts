/** Today's pushes for the notifications page, read on this phone (works with no signal). */
import { useMemo } from 'react';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import {
  budgetUsed,
  LEDGER_TODAY_SQL,
  localDateOf,
  PINGS_TODAY_SQL,
  TODAY_TABLES,
  todayPings,
  type PingRow,
} from './todays-pings';

export function useTodaysPings(budget: number, hideText: boolean) {
  const uid = useOwnerUid();
  const today = localDateOf(new Date());
  const params = uid === null ? null : [uid, today];
  const ledger = useLiveRows<{ sent_budgeted: number | null }>(
    LEDGER_TODAY_SQL,
    params,
    TODAY_TABLES,
  );
  const pings = useLiveRows<PingRow>(PINGS_TODAY_SQL, params, TODAY_TABLES);
  const list = useMemo(() => todayPings(pings.rows, hideText), [pings.rows, hideText]);
  return {
    loaded: ledger.loaded && pings.loaded,
    ...budgetUsed(ledger.rows[0]?.sent_budgeted, budget),
    pings: list,
  };
}
