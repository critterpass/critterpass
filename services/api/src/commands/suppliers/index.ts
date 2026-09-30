/**
 * The supplier commands (docs/api-contracts.md §4.11), registered by `registerSupplierRoutes`.
 */
import type { CommandRegistry } from '../_framework/registry';
import { createBookActivityCommand } from './book-activity';
import { createCancelActivityBookingCommand } from './cancel-activity-booking';
import { createHoldActivityCommand, type OrderCommandDeps } from './hold-activity';
import { createRecordSupplierClickCommand, type SupplierClickDeps } from './record-supplier-click';
import { releaseActivityHoldCommand } from './release-activity-hold';

export type SupplierCommandDeps = SupplierClickDeps & OrderCommandDeps;

export function registerSupplierCommands(
  registry: CommandRegistry,
  deps: SupplierCommandDeps,
): void {
  registry.register(createRecordSupplierClickCommand(deps));
  registry.register(createHoldActivityCommand(deps));
  registry.register(createBookActivityCommand(deps));
  registry.register(releaseActivityHoldCommand);
  registry.register(createCancelActivityBookingCommand(deps));
}
