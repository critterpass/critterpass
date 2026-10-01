/**
 * Invite and seat commands plus the link providers they pair with, registered at boot with the
 * runtime secrets they need (./deps.ts).
 */
import type { crypto as dbCrypto } from '@cp/db';

import type { LinkProviderRegistry } from '../../links/registry';
import { createInviteLinkProvider, phoneInviteMatcher } from '../../links/providers/invite';
import { referralLinkProvider } from '../../links/providers/referral';
import type { CommandRegistry } from '../_framework/registry';
import { registerReferralCommands } from '../referrals';
import { createAcceptInviteCommand } from './accept-invite';
import { declineInviteCommand, deferInviteCommand, revokeInviteCommand } from './answer-invite';
import { createCreateInviteCommand } from './create-invite';
import { inviteDepsFromEnv, type InviteCommandDeps, type InviteEnv } from './deps';
import { joinTripCommand } from './join-trip';
import { acceptSeatOfferCommand, promoteWaitlistCommand } from './seat-offers';

export { inviteDepsFromEnv, type InviteCommandDeps, type InviteEnv } from './deps';

export function registerInviteCommands(registry: CommandRegistry, deps: InviteCommandDeps): void {
  registry.register(createCreateInviteCommand(deps));
  registry.register(createAcceptInviteCommand(deps));
  registry.register(deferInviteCommand);
  registry.register(declineInviteCommand);
  registry.register(revokeInviteCommand);
  registry.register(joinTripCommand);
  registry.register(promoteWaitlistCommand);
  registry.register(acceptSeatOfferCommand);
  registerReferralCommands(registry);
}

/** The invite, join-code and referral link providers and the phone matcher. */
export function registerInviteLinkProviders(
  links: LinkProviderRegistry,
  keyring: dbCrypto.FieldEncryptionKeyring | null,
): void {
  links.register(createInviteLinkProvider(keyring));
  links.register(referralLinkProvider);
  links.setPhoneMatcher(phoneInviteMatcher);
}

/** Boot wiring: the invite commands and link providers with the secrets from the environment. */
export function registerInvites(
  commands: CommandRegistry,
  links: LinkProviderRegistry,
  env: InviteEnv,
  linkEnv: InviteCommandDeps['linkEnv'],
  fieldKeyring: dbCrypto.FieldEncryptionKeyring | null | undefined,
): void {
  registerInviteLinkProviders(links, fieldKeyring ?? null);
  registerInviteCommands(commands, inviteDepsFromEnv(env, linkEnv, fieldKeyring));
}
