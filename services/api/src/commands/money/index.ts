/** Money commands: expenses, the budget target, the settlement currency and settling up. */
import type { CommandRegistry } from '../_framework/registry';
import { addExpenseCommand } from './add-expense';
import { setCrewSettlementCurrencyCommand, setTripBudgetCommand } from './budget-and-currency';
import { commitReceiptCommand } from './commit-receipt';
import { confirmPaidCommand, disputePaymentCommand } from './confirm-paid';
import { deleteExpenseCommand, editExpenseCommand } from './edit-expense';
import { markPaidCommand } from './mark-paid';
import {
  nudgePaymentCommand,
  remindAllPaymentsCommand,
  requestPaymentCommand,
} from './request-payment';

export function registerMoneyCommands(registry: CommandRegistry): void {
  registry.register(addExpenseCommand);
  registry.register(editExpenseCommand);
  registry.register(deleteExpenseCommand);
  registry.register(setTripBudgetCommand);
  registry.register(setCrewSettlementCurrencyCommand);
  registry.register(requestPaymentCommand);
  registry.register(nudgePaymentCommand);
  registry.register(remindAllPaymentsCommand);
  registry.register(markPaidCommand);
  registry.register(confirmPaidCommand);
  registry.register(disputePaymentCommand);
  registry.register(commitReceiptCommand);
}
