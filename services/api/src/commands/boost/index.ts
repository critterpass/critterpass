/** Boost commands: the trip lock around a purchase, and thanking the buyer. */
import type { CommandRegistry } from '../_framework/registry';
import type { BillingCommandDeps } from '../billing/fulfil-purchase';
import { createBoostIntentCommand } from './create-boost-intent';
import { releaseBoostIntentCommand } from './release-boost-intent';
import { thankBoostCommand } from './thank-boost';

export function registerBoostCommands(
  registry: CommandRegistry,
  deps: Pick<BillingCommandDeps, 'switches'>,
): void {
  registry.register(createBoostIntentCommand(deps));
  registry.register(releaseBoostIntentCommand);
  registry.register(thankBoostCommand);
}
