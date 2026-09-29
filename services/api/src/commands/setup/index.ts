/** Trip setup commands: dates, calendars, the private ask and the setup step. */
import type { CommandRegistry } from '../_framework/registry';
import { answerAvailabilityAskCommand, askAvailabilityCommand } from './ask-availability';
import {
  createConnectCalendarCommand,
  createDisconnectCalendarCommand,
  type CalendarCommandDeps,
} from './connect-calendar';
import { lockTripDatesCommand, setSetupStepCommand } from './lock-trip-dates';
import { setAvailabilityCommand } from './set-availability';
import { setBudgetDefaultCommand, submitBudgetMaxCommand } from './submit-budget-max';

export function registerSetupCommands(registry: CommandRegistry): void {
  registry.register(setAvailabilityCommand);
  registry.register(askAvailabilityCommand);
  registry.register(answerAvailabilityAskCommand);
  registry.register(lockTripDatesCommand);
  registry.register(setSetupStepCommand);
  registry.register(submitBudgetMaxCommand);
  registry.register(setBudgetDefaultCommand);
}

/** The calendar connection commands need the OAuth config, the state store and the flag gate. */
export function registerCalendarCommands(
  registry: CommandRegistry,
  deps: CalendarCommandDeps,
): void {
  registry.register(createConnectCalendarCommand(deps));
  registry.register(createDisconnectCalendarCommand(deps));
}
