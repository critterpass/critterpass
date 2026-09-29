/**
 * Client specs for Money's commands. Adding, editing and deleting an expense, and marking a
 * payment paid, may wait in the offline queue (the ledger is the server's, so the list shows them
 * as pending until their rows sync). Requests, nudges, confirms, disputes, reminders, the budget,
 * the settlement currency, payout methods and receipt commits go online so the member learns at
 * once whether they landed.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  AddExpensePayload,
  CommitReceiptPayload,
  DeleteExpensePayload,
  EditExpensePayload,
  MarkPaidPayload,
  RequestPaymentPayload,
  SetCrewSettlementCurrencyPayload,
  SetPayoutMethodPayload,
  SetTripBudgetPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const addExpenseCommand = defineClientCommand<AddExpensePayload>({
  name: 'add_expense',
  offline: true,
  summarize: (payload) => {
    const what = payload.description || payload.merchant || '';
    return what === ''
      ? msg({ id: 'money.queued.addExpenseNoName', message: 'A new expense' })
      : msg({ id: 'money.queued.addExpense', message: `Expense: ${what}` });
  },
});

export const editExpenseCommand = defineClientCommand<EditExpensePayload>({
  name: 'edit_expense',
  offline: true,
  summarize: () => msg({ id: 'money.queued.editExpense', message: 'An expense edit' }),
});

export const deleteExpenseCommand = defineClientCommand<DeleteExpensePayload>({
  name: 'delete_expense',
  offline: true,
  summarize: () => msg({ id: 'money.queued.deleteExpense', message: 'A deleted expense' }),
});

export const markPaidCommand = defineClientCommand<MarkPaidPayload>({
  name: 'mark_paid',
  offline: true,
  summarize: () => msg({ id: 'money.queued.markPaid', message: 'A payment marked paid' }),
});

export const requestPaymentCommand = defineClientCommand<RequestPaymentPayload>({
  name: 'request_payment',
  offline: false,
});

export const nudgePaymentCommand = defineClientCommand<{ payment_id: string }>({
  name: 'nudge_payment',
  offline: false,
});

export const confirmPaidCommand = defineClientCommand<{ payment_id: string }>({
  name: 'confirm_paid',
  offline: false,
});

export const disputePaymentCommand = defineClientCommand<{ payment_id: string; note?: string }>({
  name: 'dispute_payment',
  offline: false,
});

export const remindAllPaymentsCommand = defineClientCommand<{ trip_id: string }>({
  name: 'remind_all_payments',
  offline: false,
});

export const setTripBudgetCommand = defineClientCommand<SetTripBudgetPayload>({
  name: 'set_trip_budget',
  offline: false,
});

export const setSettlementCurrencyCommand = defineClientCommand<SetCrewSettlementCurrencyPayload>({
  name: 'set_crew_settlement_currency',
  offline: false,
});

export const setPayoutMethodCommand = defineClientCommand<SetPayoutMethodPayload>({
  name: 'set_payout_method',
  offline: false,
});

export const commitReceiptCommand = defineClientCommand<CommitReceiptPayload>({
  name: 'commit_receipt',
  offline: false,
});
