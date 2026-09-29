/** Booking commands: the wallet's manual add, edit, delete and sharing. */
import type { CommandRegistry } from '../_framework/registry';
import { createAddBookingCommand } from './add-booking';
import { deleteBookingCommand } from './delete-booking';
import type { BookingCommandDeps } from './deps';
import { createEditBookingCommand } from './edit-booking';
import { setBookingVisibilityCommand } from './set-booking-visibility';

export type { BookingCommandDeps } from './deps';

export function registerBookingCommands(registry: CommandRegistry, deps: BookingCommandDeps): void {
  registry.register(createAddBookingCommand(deps));
  registry.register(createEditBookingCommand(deps));
  registry.register(deleteBookingCommand);
  registry.register(setBookingVisibilityCommand);
}
