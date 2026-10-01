/**
 * Client specs for the proposal and RSVP commands (docs/api-contracts-proposal.md). Building a
 * proposal, the private reason, the lock and the RSVP that answers the seat question there and
 * then need the server's answer; sending, reacting, opening and the rest wait in the offline
 * queue. An RSVP made offline is queued with its own spec and shows as pending.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type { PrivateReason, ProposalFormat, ProposalReaction, RsvpReply } from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export interface CreateProposalInput {
  readonly trip_id: string;
  readonly config: {
    readonly format: ProposalFormat;
    readonly show_cost: boolean;
    readonly personal: boolean;
    readonly reply_by?: string;
    readonly options: readonly string[];
  };
}

export interface ProposalIdInput {
  readonly proposal_id: string;
}

export interface SetRsvpInput {
  readonly proposal_id: string;
  readonly status: RsvpReply;
  readonly option_ids: readonly string[];
}

export const createProposalCommand = defineClientCommand<CreateProposalInput>({
  name: 'create_proposal',
  offline: false,
});

export const sendProposalCommand = defineClientCommand<ProposalIdInput>({
  name: 'send_proposal',
  offline: true,
  summarize: () => msg({ id: 'proposal.queued.send', message: 'Sending the proposal' }),
});

export const lockProposalCommand = defineClientCommand<ProposalIdInput>({
  name: 'lock_proposal',
  offline: false,
});

/** The RSVP with the seat answer now (seat cap, waitlist place). */
export const setRsvpCommand = defineClientCommand<SetRsvpInput>({
  name: 'set_rsvp',
  offline: false,
});

/** The same RSVP queued while offline; the server's cap check lands when it drains. */
export const setRsvpQueuedCommand = defineClientCommand<SetRsvpInput>({
  name: 'set_rsvp',
  offline: true,
  summarize: () => msg({ id: 'proposal.queued.rsvp', message: 'Your reply to the proposal' }),
});

export const reactProposalCommand = defineClientCommand<{
  readonly proposal_id: string;
  readonly reaction: ProposalReaction;
}>({
  name: 'react_proposal',
  offline: true,
  summarize: () => msg({ id: 'proposal.queued.react', message: 'A reaction to the proposal' }),
});

export const recordProposalOpenCommand = defineClientCommand<{
  readonly proposal_id: string;
  readonly kind: 'open' | 'view_slide';
  readonly local_hour?: number;
}>({ name: 'record_proposal_open', offline: true });

export const submitPrivateReasonCommand = defineClientCommand<{
  readonly proposal_id: string;
  readonly reason: PrivateReason;
  readonly text?: string;
}>({ name: 'submit_private_reason', offline: false });

export const choosePrivateOptionCommand = defineClientCommand<{
  readonly thread_id: string;
  readonly option_id: string;
}>({
  name: 'choose_private_option',
  offline: true,
  summarize: () => msg({ id: 'proposal.queued.option', message: 'Your private choice' }),
});

export const scheduleFollowupCommand = defineClientCommand<{
  readonly proposal_id: string;
  readonly at_local: string;
  readonly tz?: string;
}>({
  name: 'schedule_proposal_followup',
  offline: true,
  summarize: () => msg({ id: 'proposal.queued.followup', message: 'A reminder to decide' }),
});

export const executeSuggestionCommand = defineClientCommand<{ readonly suggestion_id: string }>({
  name: 'execute_rsvp_suggestion',
  offline: true,
  summarize: () => msg({ id: 'proposal.queued.suggestion', message: 'A guide suggestion' }),
});

export const dismissSuggestionCommand = defineClientCommand<{ readonly suggestion_id: string }>({
  name: 'dismiss_rsvp_suggestion',
  offline: true,
  summarize: () => msg({ id: 'proposal.queued.dismiss', message: 'Dismissing a suggestion' }),
});

/** The organiser locks the plan in with nobody to send it to (a crew of one). */
export const lockInPlanCommand = defineClientCommand<{ readonly trip_id: string }>({
  name: 'lock_in_plan',
  offline: false,

export const resolveDropoutCommand = defineClientCommand<{
  readonly trip_id: string;
  readonly uid: string;
}>({
  name: 'resolve_dropout',
  offline: true,
  summarize: () => msg({ id: 'proposal.queued.resolve', message: 'Applying the re-split' }),
});

export const setKeepInChatCommand = defineClientCommand<{
  readonly crew_id: string;
  readonly uid: string;
  readonly keep: boolean;
}>({
  name: 'set_keep_in_chat',
  offline: true,
  summarize: () => msg({ id: 'proposal.queued.keepInChat', message: 'Who stays in the chat' }),
});
