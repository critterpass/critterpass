/** Proposal and RSVP commands, registered on the one command registry at boot. */
import type { FieldKeyring } from '../bookings/deps';
import type { CommandRegistry } from '../_framework/registry';
import { choosePrivateOptionCommand } from './choose-private-option';
import { createProposalCommand } from './create-proposal';
import { declineTripCommand } from './decline-trip';
import { lockInPlanCommand } from './lock-in-plan';
import { lockProposalCommand } from './lock-proposal';
import { publishOfferCommand } from './publish-offer';
import { reactProposalCommand } from './react-proposal';
import { resolveDropoutCommand } from './resolve-dropout';
import { recordProposalOpenCommand } from './record-proposal-open';
import { dismissRsvpSuggestionCommand, executeRsvpSuggestionCommand } from './rsvp-suggestions';
import { scheduleProposalFollowupCommand } from './schedule-proposal-followup';
import { sendProposalCommand } from './send-proposal';
import { setKeepInChatCommand } from './set-keep-in-chat';
import { setRsvpCommand } from './set-rsvp';
import { createSubmitPrivateReasonCommand } from './submit-private-reason';

export function registerProposalCommands(
  registry: CommandRegistry,
  deps: { readonly keyring?: FieldKeyring } = {},
): void {
  registry.register(createProposalCommand);
  registry.register(sendProposalCommand);
  registry.register(lockProposalCommand);
  registry.register(lockInPlanCommand);
  registry.register(setRsvpCommand);
  registry.register(reactProposalCommand);
  registry.register(recordProposalOpenCommand);
  registry.register(createSubmitPrivateReasonCommand(deps));
  registry.register(choosePrivateOptionCommand);
  registry.register(scheduleProposalFollowupCommand);
  registry.register(executeRsvpSuggestionCommand);
  registry.register(dismissRsvpSuggestionCommand);
  registry.register(publishOfferCommand);
  registry.register(declineTripCommand);
  registry.register(setKeepInChatCommand);
  registry.register(resolveDropoutCommand);
}
