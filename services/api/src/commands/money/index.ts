/** Money commands: expenses, the budget target, the settlement currency and settling up. */
import type { CommandRegistry } from '../_framework/registry';
import { addExpenseCommand } from './add-expense';
import { setCrewSettlementCurrencyCommand, setTripBudgetCommand } from './budget-and-currency';
import { deleteExpenseCommand, editExpenseCommand } from './edit-expense';

export function registerMoneyCommands(registry: CommandRegistry): void {
  registry.register(addExpenseCommand);
  registry.register(editExpenseCommand);
  registry.register(deleteExpenseCommand);
  registry.register(setTripBudgetCommand);
  registry.register(setCrewSettlementCurrencyCommand);
}
