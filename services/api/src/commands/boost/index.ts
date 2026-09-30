/** Boost commands: the trip lock around a purchase, thanks, moves, credits and crew yearly. */
import type { CommandRegistry } from '../_framework/registry';
import type { BillingCommandDeps } from '../billing/fulfil-purchase';
import { createBoostIntentCommand } from './create-boost-intent';
import { applyBoostCreditCommand, moveBoostCommand } from './move-boost';
import { recordPaywallEventCommand } from '../paywall/record-paywall-event';
import { rebindCrewYearCommand } from './rebind-crew-year';
import { releaseBoostIntentCommand } from './release-boost-intent';
import { thankBoostCommand } from './thank-boost';

export function registerBoostCommands(
  registry: CommandRegistry,
  deps: Pick<BillingCommandDeps, 'switches'>,
): void {
  registry.register(createBoostIntentCommand(deps));
  registry.register(releaseBoostIntentCommand);
  registry.register(thankBoostCommand);
  registry.register(moveBoostCommand);
  registry.register(applyBoostCreditCommand);
  registry.register(rebindCrewYearCommand);
  registry.register(recordPaywallEventCommand);
}
