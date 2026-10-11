/** Trip setup commands: dates, calendars, the private ask and the setup step. */
import type { CommandRegistry } from '../_framework/registry';
import { answerAvailabilityAskCommand, askAvailabilityCommand } from './ask-availability';
import {
  createConnectCalendarCommand,
  createDisconnectCalendarCommand,
  type CalendarCommandDeps,
} from './connect-calendar';
import { setGettingThereCommand } from './getting-there';
import { lockTripDatesCommand, setSetupStepCommand } from './lock-trip-dates';
import { setAvailabilityCommand } from './set-availability';
import { setBudgetDefaultCommand, submitBudgetMaxCommand } from './submit-budget-max';
import { setMustDosCommand, trackLotteryCommand } from './must-dos';
import { requestRoomSwapCommand, setRoomPrefsCommand } from './room-prefs';
import { lockRoomsCommand, setRoomAssignmentCommand, setStayChoiceCommand } from './rooms';

export function registerSetupCommands(registry: CommandRegistry): void {
  registry.register(setAvailabilityCommand);
  registry.register(askAvailabilityCommand);
  registry.register(answerAvailabilityAskCommand);
  registry.register(lockTripDatesCommand);
  registry.register(setSetupStepCommand);
  registry.register(submitBudgetMaxCommand);
  registry.register(setBudgetDefaultCommand);
  registry.register(setStayChoiceCommand);
  registry.register(setRoomAssignmentCommand);
  registry.register(lockRoomsCommand);
  registry.register(setRoomPrefsCommand);
  registry.register(requestRoomSwapCommand);
  registry.register(setMustDosCommand);
  registry.register(trackLotteryCommand);
  registry.register(setGettingThereCommand);
}

/** The calendar connection commands need the OAuth config, the state store and the flag gate. */
export function registerCalendarCommands(
  registry: CommandRegistry,
  deps: CalendarCommandDeps,
): void {
  registry.register(createConnectCalendarCommand(deps));
  registry.register(createDisconnectCalendarCommand(deps));
}
