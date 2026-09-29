/** Store purchase commands: the app's purchase report and the system's refund path. */
import type { CommandRegistry } from '../_framework/registry';
import { fulfilPurchaseCommand, type BillingCommandDeps } from './fulfil-purchase';
import { revokePurchaseCommand } from './revoke-purchase';

export type { BillingCommandDeps } from './fulfil-purchase';

export function registerBillingCommands(registry: CommandRegistry, deps: BillingCommandDeps): void {
  registry.register(fulfilPurchaseCommand(deps));
  registry.register(revokePurchaseCommand);
}
