/**
 * Taking the seat: `accept_invite` online (a join needs the server's seat count), with every way
 * it can fail mapped to a state the invited screens show in place (never an error toast): the
 * link expired or was revoked, the code is unknown or used up, the crew is full or the joiner is
 * in too many crews, the trip is over, too many tries, or the join could not reach the server.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names and wire codes, never copy. */
import type { AcceptInvitePayload, AcceptInviteResult } from '@cp/domain';

import type { CommandClient } from '@/data/commands/client';
import { defineClientCommand } from '@/data/commands/summaries';

export const ACCEPT_INVITE = defineClientCommand<AcceptInvitePayload>({
  name: 'accept_invite',
  offline: false,
});

export type JoinProblem =
  | 'expired'
  | 'revoked'
  | 'invalid'
  | 'used_up'
  | 'crew_full'
  | 'crew_limit'
  | 'trip_closed'
  | 'rate_limited'
  | 'offline'
  | 'failed';

export type JoinOutcome =
  | { readonly kind: 'joined'; readonly result: AcceptInviteResult }
  | { readonly kind: 'problem'; readonly problem: JoinProblem };

function isAcceptResult(value: unknown): value is AcceptInviteResult {
  return typeof (value as Partial<AcceptInviteResult> | null)?.crew_id === 'string';
}

function reasonOf(detail: unknown): string | null {
  const reason = (detail as { reason?: unknown } | null)?.reason;
  return typeof reason === 'string' ? reason : null;
}

export function problemFor(code: string, detail: unknown): JoinProblem {
  switch (code) {
    case 'INVITE_EXPIRED':
      return 'expired';
    case 'INVITE_REVOKED':
      return 'revoked';
    case 'CODE_INVALID':
    case 'NOT_FOUND':
    case 'VALIDATION':
      return 'invalid';
    case 'CODE_REDEEMED':
      return 'used_up';
    case 'RATE_LIMITED':
      return 'rate_limited';
    case 'STATE_INVALID': {
      const reason = reasonOf(detail);
      if (reason === 'crew_full') return 'crew_full';
      if (reason === 'crew_limit') return 'crew_limit';
      if (reason === 'trip_closed') return 'trip_closed';
      return 'failed';
    }
    default:
      return 'failed';
  }
}

/** A join failure as the problem card shows it (an unknown code reads like a missing invite). */
export function problemCardOf(problem: JoinProblem): Exclude<JoinProblem, 'invalid'> | 'not_found' {
  return problem === 'invalid' ? 'not_found' : problem;
}

/** Problems where sending the same join again can work: it never arrived, or was told to wait. */
export function canRetryJoin(problem: JoinProblem): boolean {
  return problem === 'offline' || problem === 'failed' || problem === 'rate_limited';
}

/** De-dupe id of the "no crew with that code" toast for one typed code. */
export function wrongCodeToastId(code: string): string {
  return `invite-code-wrong-${code}`;
}

export async function acceptInvite(
  commands: Pick<CommandClient, 'send'>,
  payload: AcceptInvitePayload,
): Promise<JoinOutcome> {
  const sent = await commands.send(ACCEPT_INVITE, payload);
  switch (sent.kind) {
    case 'applied':
      return isAcceptResult(sent.result)
        ? { kind: 'joined', result: sent.result }
        : { kind: 'problem', problem: 'failed' };
    case 'rejected':
      return { kind: 'problem', problem: problemFor(sent.code, sent.detail) };
    case 'unavailable':
    case 'queued':
      return { kind: 'problem', problem: 'offline' };
  }
}
