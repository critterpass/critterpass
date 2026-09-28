/** Referral commands, registered on the one command registry at boot. */
import type { CommandRegistry } from '../_framework/registry';
import { attributeReferralCommand } from './attribute';
import { mintReferralCodeCommand } from './code';
import { voidReferralCommand } from './void';

export { attributeReferral, type AttributionInput } from './attribute';

export function registerReferralCommands(registry: CommandRegistry): void {
  registry.register(attributeReferralCommand);
  registry.register(voidReferralCommand);
  registry.register(mintReferralCodeCommand);
}
