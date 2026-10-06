/**
 * The driver commands (docs/api-contracts-suppliers.md §4.11), registered by `registerDriverRoutes`.
 */
import type { CommandRegistry } from '../_framework/registry';
import { assignProviderCommand } from './assign-provider';
import { createConfirmProviderFieldsCommand } from './confirm-provider-fields';
import { dismissPickupGapCommand } from './dismiss-pickup-gap';
import { shareProviderIntakeCommand } from './share-provider-intake';
import type { DriverDeps } from './shared';
import { shortlistProviderCommand } from './shortlist-provider';

export function registerDriverCommands(registry: CommandRegistry, deps: DriverDeps): void {
  registry.register(shareProviderIntakeCommand);
  registry.register(createConfirmProviderFieldsCommand(deps));
  registry.register(shortlistProviderCommand);
  registry.register(assignProviderCommand);
  registry.register(dismissPickupGapCommand);
}
