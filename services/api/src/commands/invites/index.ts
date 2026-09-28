/**
 * Invite and seat commands plus the link providers they pair with, registered at boot with the
 * runtime secrets they need (./deps.ts).
 */
import type { crypto as dbCrypto } from '@cp/db';

import type { LinkProviderRegistry } from '../../links/registry';
import { createInviteLinkProvider, phoneInviteMatcher } from '../../links/providers/invite';
import { referralLinkProvider } from '../../links/providers/referral';
import type { CommandRegistry } from '../_framework/registry';
import { createAcceptInviteCommand } from './accept-invite';
import { declineInviteCommand, deferInviteCommand, revokeInviteCommand } from './answer-invite';
import { createCreateInviteCommand } from './create-invite';
import type { InviteCommandDeps } from './deps';
import { acceptSeatOfferCommand, promoteWaitlistCommand } from './seat-offers';

export type { InviteCommandDeps } from './deps';

export function registerInviteCommands(registry: CommandRegistry, deps: InviteCommandDeps): void {
  registry.register(createCreateInviteCommand(deps));
  registry.register(createAcceptInviteCommand(deps));
  registry.register(deferInviteCommand);
  registry.register(declineInviteCommand);
  registry.register(revokeInviteCommand);
  registry.register(promoteWaitlistCommand);
  registry.register(acceptSeatOfferCommand);
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
