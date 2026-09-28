/**
 * The invite lifecycle. A new invite is `pending`; an in-app invitee may park it (`later`) or
 * decline it; a claim seats the invitee (`claimed`) or, on a full trip, waitlists them
 * (`waitlisted`, later `claimed` once they accept a freed seat). Open invites expire at
 * `expires_at` or are revoked by their inviter or a crew organiser. Terminal: declined, claimed,
 * expired, revoked.
 */
import { z } from 'zod';

import { DomainError } from '../errors';
import { createStateMachine, type Transition } from '../state/machine';

export const INVITE_STATUSES = [
  'pending',
  'later',
  'declined',
  'claimed',
  'waitlisted',
  'expired',
  'revoked',
] as const;
export const inviteStatusSchema = z.enum(INVITE_STATUSES);
export type InviteStatus = z.infer<typeof inviteStatusSchema>;

export const INVITE_KINDS = ['personal', 'generic'] as const;
export type InviteKind = (typeof INVITE_KINDS)[number];

/** A new invite lives 14 days unless the inviter picks otherwise. */
export const INVITE_TTL_DAYS = 14;
export const INVITE_TTL_MAX_DAYS = 30;

const OPEN: readonly InviteStatus[] = ['pending', 'later'];

const transitions: Transition<InviteStatus>[] = [
  { from: null, to: 'pending' },
  { from: 'pending', to: 'later' },
  { from: 'later', to: 'pending' },
  ...OPEN.flatMap((from): Transition<InviteStatus>[] => [
    { from, to: 'declined' },
    { from, to: 'claimed' },
    { from, to: 'waitlisted' },
  ]),
  { from: 'waitlisted', to: 'claimed' },
  ...[...OPEN, 'waitlisted' as const].flatMap((from): Transition<InviteStatus>[] => [
    { from, to: 'expired' },
    { from, to: 'revoked' },
  ]),
];

export const inviteStateMachine = createStateMachine(transitions);

export function isOpenInvite(status: InviteStatus): boolean {
  return status === 'pending' || status === 'later';
}

export function isTerminalInvite(status: InviteStatus): boolean {
  return (
    status === 'declined' || status === 'claimed' || status === 'expired' || status === 'revoked'
  );
}

/**
 * The status an invite really has at `now`: an open or waitlisted invite past its expiry reads as
 * expired even before the hourly sweep writes it.
 */
export function effectiveInviteStatus(
  status: InviteStatus,
  expiresAt: Date,
  now: Date,
): InviteStatus {
  if ((isOpenInvite(status) || status === 'waitlisted') && expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }
  return status;
}

/**
 * Throws the error a claim of this invite must answer with, unless it can still be claimed. A
 * claimed or declined personal invite is not an error here: the forwarding rule decides whether
 * the link still opens a generic seat.
 */
export function assertInviteClaimable(status: InviteStatus, expiresAt: Date, now: Date): void {
  const effective = effectiveInviteStatus(status, expiresAt, now);
  if (effective === 'expired') throw new DomainError('INVITE_EXPIRED');
  if (effective === 'revoked') throw new DomainError('INVITE_REVOKED');
}

export function transitionInvite(from: InviteStatus | null, to: InviteStatus): InviteStatus {
  return inviteStateMachine.transition(from, to).to;
}
