/**
 * The synced money rows of one trip: its ledger entries, payments, live expenses and their shares,
 * and the money commands still in the offline queue. Screens derive everything else from these
 * with the engine, so a new row anywhere re-renders them within the sync tick.
 */
import { useMemo } from 'react';

import { useLiveRows } from './live-rows';
import {
  EXPENSES_SQL,
  EXPENSES_TABLES,
  LEDGER_SQL,
  LEDGER_TABLES,
  PAYMENTS_SQL,
  PAYMENTS_TABLES,
  PENDING_MONEY_SQL,
  PENDING_TABLES,
  SHARES_SQL,
  SHARES_TABLES,
  type ExpenseRow,
  type LedgerRow,
  type PaymentRow,
  type PendingCommandRow,
  type ShareRow,
} from './queries';

export interface TripMoneyRows {
  readonly loaded: boolean;
  readonly ledger: readonly LedgerRow[];
  readonly payments: readonly PaymentRow[];
  readonly expenses: readonly ExpenseRow[];
  readonly shares: readonly ShareRow[];
  readonly pending: readonly PendingCommandRow[];
}

export function useTripMoney(crewId: string | null, tripId: string | null): TripMoneyRows {
  const ready = crewId !== null && tripId !== null;
  const ledger = useLiveRows<LedgerRow>(LEDGER_SQL, ready ? [crewId, tripId] : null, LEDGER_TABLES);
  const payments = useLiveRows<PaymentRow>(PAYMENTS_SQL, ready ? [tripId] : null, PAYMENTS_TABLES);
  const expenses = useLiveRows<ExpenseRow>(EXPENSES_SQL, ready ? [tripId] : null, EXPENSES_TABLES);
  const shares = useLiveRows<ShareRow>(SHARES_SQL, ready ? [tripId] : null, SHARES_TABLES);
  const pending = useLiveRows<PendingCommandRow>(PENDING_MONEY_SQL, [], PENDING_TABLES);
  return useMemo(
    () => ({
      loaded: ledger.loaded && payments.loaded && expenses.loaded,
      ledger: ledger.rows,
      payments: payments.rows,
      expenses: expenses.rows,
      shares: shares.rows,
      pending: pending.rows,
    }),
    [
      ledger.loaded,
      payments.loaded,
      expenses.loaded,
      ledger.rows,
      payments.rows,
      expenses.rows,
      shares.rows,
      pending.rows,
    ],
  );
}
