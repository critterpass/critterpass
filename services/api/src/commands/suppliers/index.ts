/**
 * The supplier commands (docs/api-contracts.md §4.11), registered by `registerSupplierRoutes`.
 */
import type { CommandRegistry } from '../_framework/registry';
import { createBookActivityCommand } from './book-activity';
import { createCancelActivityBookingCommand } from './cancel-activity-booking';
import { createHoldActivityCommand, type OrderCommandDeps } from './hold-activity';
import { logRideCommand } from './log-ride';
import { createRecordSupplierClickCommand, type SupplierClickDeps } from './record-supplier-click';
import { releaseActivityHoldCommand } from './release-activity-hold';
import type { VendorDeps } from '../../suppliers/vendor-store';
import { approveVendorMessageCommand } from './approve-vendor-message';
import { createRequestVendorMessageCommand } from './request-vendor-message';

export type SupplierCommandDeps = SupplierClickDeps &
  OrderCommandDeps & {
    /** The desk's WhatsApp Business setup; absent = drafts go back to the traveller to send. */
    readonly vendor?: VendorDeps;
  };

const NO_DESK: VendorDeps = { whatsapp: undefined, keyring: undefined, pepper: undefined };

export function registerSupplierCommands(
  registry: CommandRegistry,
  deps: SupplierCommandDeps,
): void {
  registry.register(createRequestVendorMessageCommand(deps.vendor ?? NO_DESK));
  registry.register(approveVendorMessageCommand);
  registry.register(createRecordSupplierClickCommand(deps));
  registry.register(createHoldActivityCommand(deps));
  registry.register(createBookActivityCommand(deps));
  registry.register(releaseActivityHoldCommand);
  registry.register(createCancelActivityBookingCommand(deps));
  registry.register(logRideCommand);
}
