/** Booking commands: the wallet's manual add, edit, delete and sharing, and imports. */
import type { CommandRegistry } from '../_framework/registry';
import { createAddBookingCommand } from './add-booking';
import { deleteBookingCommand } from './delete-booking';
import type { BookingCommandDeps } from './deps';
import { createEditBookingCommand } from './edit-booking';
import { importPasteCommand } from './import-paste';
import { importScanCommand } from './import-scan';
import { createResolveImportCandidateCommand } from './resolve-import-candidate';
import { reportLandedCommand } from './report-landed';
import { setFlightCrewVisibilityCommand } from './set-flight-crew-visibility';
import { watchFlightCommand } from './watch-flight';
import { setBookingVisibilityCommand } from './set-booking-visibility';

export type { BookingCommandDeps } from './deps';

export function registerBookingCommands(registry: CommandRegistry, deps: BookingCommandDeps): void {
  registry.register(createAddBookingCommand(deps));
  registry.register(createEditBookingCommand(deps));
  registry.register(deleteBookingCommand);
  registry.register(setBookingVisibilityCommand);
  registry.register(importPasteCommand);
  registry.register(importScanCommand);
  registry.register(createResolveImportCandidateCommand(deps));
  registry.register(watchFlightCommand);
  registry.register(reportLandedCommand);
  registry.register(setFlightCrewVisibilityCommand);
}
