/**
 * Store purchase commands: the app's purchase report, the system's refund path and the planned
 * pause.
 */
import type { CommandRegistry } from '../_framework/registry';
import { fulfilPurchaseCommand, type BillingCommandDeps } from './fulfil-purchase';
import { revokePurchaseCommand } from './revoke-purchase';
import { setPauseIntentCommand } from './set-pause-intent';

export type { BillingCommandDeps } from './fulfil-purchase';

export function registerBillingCommands(registry: CommandRegistry, deps: BillingCommandDeps): void {
  registry.register(fulfilPurchaseCommand(deps));
  registry.register(revokePurchaseCommand);
  registry.register(setPauseIntentCommand);
}
