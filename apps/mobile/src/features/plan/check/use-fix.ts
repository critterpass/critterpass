/**
 * What FIX does on a plan check card (7h-1): a one-tap fix goes out as `apply_check_fix` (an
 * organiser's applies at once with an undo in the trip feed; a member's goes to the crew), a
 * too-far card opens its short sheet first, and the bigger fixes open their own screen. A card
 * whose fix landed slides off; an issue from an older plan than the server's is stale: it leaves
 * too, and the check runs again on the new plan by itself. On an organiser's own draft no fix is
 * sent there, and a card whose fix is a screen of the crew's plan opens the stop instead (`ByHand`).
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire codes and screen names, never copy. */
import type { PlanCheckIssue } from '@cp/domain';
import type { Href } from 'expo-router';
import { useCallback, useState } from 'react';

import type { SendResult } from '@/data/commands/client';
import { useCommand } from '@/data/commands/use-command';

import { applyCheckFixOnline, applyDraftCheckFixOnline, keepCheckIssueCommand } from './commands';
import { checkRoutes } from './routes';

export type FixAction =
  | { readonly kind: 'apply' }
  | { readonly kind: 'too_far' }
  | { readonly kind: 'screen'; readonly href: Href }
  /** No fix of the guide's can be sent for this plan: the way to the stop, to change it by hand. */
  | { readonly kind: 'by_hand'; readonly href: Href }
  | { readonly kind: 'none' };

/**
 * Where a card leads on an organiser's own draft when its fix is one of the crew plan's screens
 * (less driving, rain and crowds) or there is none: the stop's own sheet. Null: nothing to open for the issue.
 * Leave it out and the card offers its fix.
 */
export type ByHand = (issue: PlanCheckIssue) => Href | null;

export function fixActionOf(issue: PlanCheckIssue, tripId: string, byHand?: ByHand): FixAction {
  const action = crewAction(issue, tripId);
  // Her draft: a one-tap fix and the too-far swap go to the draft; the fixer screens are the
  // crew plan's, so those cards (and those with no fix) open the stop instead.
  if (byHand === undefined || action.kind === 'apply' || action.kind === 'too_far') return action;
  const href = byHand(issue);
  return href === null ? { kind: 'none' } : { kind: 'by_hand', href };
}

function crewAction(issue: PlanCheckIssue, tripId: string): FixAction {
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
  /** The move leaves less time than the real drive: refused, the plan untouched. */
  | { readonly kind: 'unfit' }
  /** Her draft: the guide is drafting or redrafting it, so nothing of it can change now. */
  | { readonly kind: 'guideWorking' }
  /** Her draft went to the crew since the check: the fix belongs on the crew's plan now. */
  | { readonly kind: 'shared' }
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
    // A fix on her own draft answers with the draft it made.
    const version = (body as { version_id?: unknown } | null)?.version_id;
    if (body?.applied === true && typeof version === 'string') {
      return { kind: 'applied', actionId: version };
    }
    if (body?.applied === false && typeof body.change_set_id === 'string') {
      return { kind: 'sent', changeSetId: body.change_set_id };
    }
    return { kind: 'failed' };
  }
  if (result.kind === 'rejected') {
    const reason = detailReason(result.detail);
    if (result.code === 'STATE_INVALID' && reason === 'fix_would_clash') return { kind: 'unfit' };
    if (result.code === 'STATE_INVALID' && (reason === 'stale_issue' || reason === 'no_fix')) {
      return { kind: 'stale' };
    }
    if (result.code === 'PLAN_VERSION_CONFLICT') return { kind: 'stale' };
    if (result.code === 'STATE_INVALID' && reason === 'draft_running') {
      return { kind: 'guideWorking' };
    }
    // The draft went to the crew, or the trip moved on past its draft: the fix is not hers to send.
    if (result.code === 'STATE_INVALID' && (reason === 'plan_shared' || reason === 'trip_status')) {
      return { kind: 'shared' };
    }
  }
  return { kind: 'failed' };
}

/**
 * Cards that leave the list: a fix that landed, or an issue the plan moved past. A fix that did
 * not go through, or that the real drive leaves no room for, keeps its card.
 */
export function cardsAfter(
  gone: ReadonlySet<string>,
  issueId: string,
  outcome: FixOutcome,
): ReadonlySet<string> {
  if (outcome.kind === 'failed' || outcome.kind === 'unfit' || outcome.kind === 'guideWorking') {
    return gone;
  }
  return new Set([...gone, issueId]);
}

export interface FixRunner {
  readonly gone: ReadonlySet<string>;
  readonly busy: string | null;
  readonly fix: (issue: PlanCheckIssue) => Promise<FixOutcome>;
  /**
   * "Keep it as it is": the card leaves at once. An organiser's keep is sent, so the check leaves
   * the issue out for the whole crew until the stops around it change; a member's is theirs alone.
   */
  readonly keep: (issue: PlanCheckIssue, organiser: boolean) => void;
  /** A fix landed on this plan version: the check is about to run again. */
  readonly fixedOn: string | null;
}

/** `draft`: the plan checked is the organiser's own draft (its fixes go to the draft). */
export function useFix(versionId: string | null, draft = false): FixRunner {
  const applyCrew = useCommand(applyCheckFixOnline);
  const applyDraft = useCommand(applyDraftCheckFixOnline);
  const apply = draft ? applyDraft : applyCrew;
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const keeper = useCommand(keepCheckIssueCommand);
  const [fixedOn, setFixedOn] = useState<string | null>(null);
  const fix = useCallback(
    async (issue: PlanCheckIssue): Promise<FixOutcome> => {
      if (versionId === null) return { kind: 'stale' };
      setBusy(issue.id);
      try {
        const outcome = fixOutcome(
          await apply.send({ issue_id: issue.id, base_version: issue.version_id }),
        );
        setGone((current) => cardsAfter(current, issue.id, outcome));
        if (outcome.kind === 'applied') setFixedOn(issue.version_id);
        return outcome;
      } finally {
        setBusy(null);
      }
    },
    [apply, versionId],
  );
  const keep = useCallback(
    (issue: PlanCheckIssue, organiser: boolean) => {
      setGone((current) => new Set([...current, issue.id]));
      if (organiser) void keeper.send({ issue_id: issue.id, base_version: issue.version_id });
    },
    [keeper],
  );
  return { gone, busy, fix, keep, fixedOn };
}
