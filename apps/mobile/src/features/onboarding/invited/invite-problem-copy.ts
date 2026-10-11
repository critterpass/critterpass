/**
 * The words for every invite state that is not "take the seat": a title and one line in Tokek's
 * voice, shared by the current problem card and the premium pages.
 */
import { t } from '@lingui/core/macro';

import type { JoinProblem } from './join';
import type { TicketStatus } from './ticket-model';

export type InviteProblemKind =
  Exclude<TicketStatus, 'loading' | 'active' | 'full'> | Exclude<JoinProblem, 'invalid'>;

export interface InviteProblemCopy {
  readonly title: string;
  readonly line: string;
}

function copyFor(kind: InviteProblemKind, inviter: string, crew: string): InviteProblemCopy {
  switch (kind) {
    case 'expired':
      return {
        title: t({ id: 'onboarding.invite.problem.expiredTitle', message: 'This invite ran out' }),
        line: t({
          id: 'onboarding.invite.problem.expiredLine',
          message: `Ask ${inviter} for a fresh link. It takes them two taps.`,
        }),
      };
    case 'revoked':
      return {
        title: t({
          id: 'onboarding.invite.problem.revokedTitle',
          message: 'This invite was taken back',
        }),
        line: t({
          id: 'onboarding.invite.problem.revokedLine',
          message: `${inviter} cancelled this one. If that was a mistake, they can send another.`,
        }),
      };
    case 'used_up':
      return {
        title: t({ id: 'onboarding.invite.problem.usedUpTitle', message: 'This code is used up' }),
        line: t({
          id: 'onboarding.invite.problem.usedUpLine',
          message: `Every place on it is taken. Ask ${inviter} for a new code.`,
        }),
      };
    case 'not_found':
    case 'failed':
      return {
        title: t({
          id: 'onboarding.invite.problem.notFoundTitle',
          message: 'Can’t find that invite',
        }),
        line: t({
          id: 'onboarding.invite.problem.notFoundLine',
          message: 'Check the code with whoever sent it, or type it in again.',
        }),
      };
    case 'offline':
      return {
        title: t({ id: 'onboarding.invite.problem.offlineTitle', message: 'You’re offline' }),
        line: t({
          id: 'onboarding.invite.problem.offlineLine',
          message: 'Your seat waits. Try again once you have signal.',
        }),
      };
    case 'referral':
      return {
        title: t({ id: 'onboarding.invite.problem.referralTitle', message: `${inviter} sent you` }),
        line: t({
          id: 'onboarding.invite.problem.referralLine',
          message: 'Make your pass and you’re both in for a stamp.',
        }),
      };
    case 'crew_full':
      return {
        title: t({ id: 'onboarding.invite.problem.crewFullTitle', message: `${crew} is full` }),
        line: t({
          id: 'onboarding.invite.problem.crewFullLine',
          message: 'Sixteen is the most a crew can hold. Ask them to make room.',
        }),
      };
    case 'crew_limit':
      return {
        title: t({
          id: 'onboarding.invite.problem.crewLimitTitle',
          message: 'That’s a lot of crews',
        }),
        line: t({
          id: 'onboarding.invite.problem.crewLimitLine',
          message: 'You’re in ten already. Leave one and this seat is yours.',
        }),
      };
    case 'trip_closed':
      return {
        title: t({ id: 'onboarding.invite.problem.tripClosedTitle', message: 'This trip is over' }),
        line: t({
          id: 'onboarding.invite.problem.tripClosedLine',
          message: `Ask ${inviter} about the next one.`,
        }),
      };
    case 'rate_limited':
      return {
        title: t({ id: 'onboarding.invite.problem.rateLimitedTitle', message: 'Too many tries' }),
        line: t({
          id: 'onboarding.invite.problem.rateLimitedLine',
          message: 'Give it a minute, then try the code again.',
        }),
      };
  }
}

/** The copy for `kind`, naming the inviter and the crew when the preview knew them. */
export function inviteProblemCopy(
  kind: InviteProblemKind,
  inviterFirstName: string | null,
  crewName: string | null,
): InviteProblemCopy {
  const inviter =
    inviterFirstName ?? t({ id: 'onboarding.invite.problem.someone', message: 'whoever sent it' });
  const crew = crewName ?? t({ id: 'onboarding.invite.problem.theCrew', message: 'The crew' });
  return copyFor(kind, inviter, crew);
}
