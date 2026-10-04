/**
 * What FIX does on a plan check card (7h-1): a one-tap fix goes out as `apply_check_fix` (an
 * organiser's applies at once with an undo in the trip feed; a member's goes to the crew), a
 * too-far card opens its short sheet first, and the bigger fixes open their own screen. A card
 * whose fix landed slides off; an issue from an older plan than the server's is stale: it leaves
 * too, and the check runs again on the new plan by itself.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire codes and screen names, never copy. */
import type { PlanCheckIssue } from '@cp/domain';
import type { Href } from 'expo-router';
import { useCallback, useState } from 'react';

import type { SendResult } from '@/data/commands/client';
import { useCommand } from '@/data/commands/use-command';

import { applyCheckFixOnline } from './commands';
import { checkRoutes } from './routes';

export type FixAction =
  | { readonly kind: 'apply' }
  | { readonly kind: 'too_far' }
  | { readonly kind: 'screen'; readonly href: Href }
  | { readonly kind: 'none' };

export function fixActionOf(issue: PlanCheckIssue, tripId: string): FixAction {
  const fix = issue.fix;
  if (fix === null || fix.kind === 'none') return { kind: 'none' };
  if (fix.kind === 'apply') return { kind: 'apply' };
  const dayId = issue.day_id;
  if (dayId === null) return { kind: 'none' };
  switch (fix.screen) {
    case 'too_far':
      return { kind: 'too_far' };
    case 'less_driving':
      return { kind: 'screen', href: checkRoutes.lessDriving(tripId, dayId) };
    case 'rain_crowds':
      return { kind: 'screen', href: checkRoutes.rain(tripId, dayId) };
    case 'fill_gap':
      return { kind: 'none' };
  }
}

export type FixOutcome =
  | { readonly kind: 'applied'; readonly actionId: string }
  | { readonly kind: 'sent'; readonly changeSetId: string }
  | { readonly kind: 'stale' }
  | { readonly kind: 'failed' };

function detailReason(detail: unknown): string | null {
  const reason = (detail as { reason?: unknown } | null | undefined)?.reason;
  return typeof reason === 'string' ? reason : null;
}

/** The server's answer to a FIX, as the card needs it. */
export function fixOutcome(result: SendResult): FixOutcome {
  if (result.kind === 'applied') {
    const body = result.result as {
      applied?: unknown;
      guide_action_id?: unknown;
      change_set_id?: unknown;
    } | null;
    if (body?.applied === true && typeof body.guide_action_id === 'string') {
      return { kind: 'applied', actionId: body.guide_action_id };
    }
    if (body?.applied === false && typeof body.change_set_id === 'string') {
      return { kind: 'sent', changeSetId: body.change_set_id };
    }
    return { kind: 'failed' };
  }
  if (result.kind === 'rejected') {
    const reason = detailReason(result.detail);
    if (result.code === 'STATE_INVALID' && (reason === 'stale_issue' || reason === 'no_fix')) {
      return { kind: 'stale' };
    }
    if (result.code === 'PLAN_VERSION_CONFLICT') return { kind: 'stale' };
  }
  return { kind: 'failed' };
}

/** Cards that leave the list: a fix that landed, or an issue the plan moved past. */
export function cardsAfter(
  gone: ReadonlySet<string>,
  issueId: string,
  outcome: FixOutcome,
): ReadonlySet<string> {
  if (outcome.kind === 'failed') return gone;
  return new Set([...gone, issueId]);
}

export interface FixRunner {
  readonly gone: ReadonlySet<string>;
  readonly busy: string | null;
  readonly fix: (issue: PlanCheckIssue) => Promise<FixOutcome>;
}

export function useFix(versionId: string | null): FixRunner {
  const apply = useCommand(applyCheckFixOnline);
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const fix = useCallback(
    async (issue: PlanCheckIssue): Promise<FixOutcome> => {
      if (versionId === null) return { kind: 'stale' };
      setBusy(issue.id);
      try {
        const outcome = fixOutcome(
          await apply.send({ issue_id: issue.id, base_version: issue.version_id }),
        );
        setGone((current) => cardsAfter(current, issue.id, outcome));
        return outcome;
      } finally {
        setBusy(null);
      }
    },
    [apply, versionId],
  );
  return { gone, busy, fix };
}
