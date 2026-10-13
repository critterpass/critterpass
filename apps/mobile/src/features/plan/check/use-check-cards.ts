/**
 * The plan check's cards, for every place that shows them (the check page and the plan sheet's
 * fix-in-place): the open fixes left after fixes that landed, kept ones and days a fixer screen
 * changed, each worded with its tags, what the fix does and its action (apply, open a fixer
 * screen, or open the stop by hand on her own draft), the nearer-place detail for a too-far stop,
 * and the toast that says what happened.
 */
/* eslint-disable lingui/no-unlocalized-strings -- toast ids, never copy. */
import type { PlanCheckIssue } from '@cp/domain';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { usePlanCheck } from '@/data/checks/use-plan-check';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { toast } from '@/motion/island-toast';

import { usePlanGuide } from '../plan-guide';
import {
  appliedToast,
  draftAppliedToast,
  failedToast,
  guideWorkingToast,
  keptToast,
  movedLine,
  nearerDetail,
  nearerNone,
  nearerUseLabel,
  sentToast,
  sharedToast,
  staleToast,
  swappedLine,
  unfitToast,
} from './check-copy';
import { useCheckContext } from './data/use-check-context';
import { useFixPreviews } from './data/use-fix-previews';
import { fixKindLabel, fixSummary, openByHandLabel } from './fix-copy';
import { useFixedDays } from './fixed-days';
import { dayTag, driveLine } from './format';
import type { IssueCardProps } from './check-props';
import { issueWords, kindTag } from './issue-copy';
import { stopHref } from './stop-href';
import { fixActionOf, useFix, type ByHand, type FixOutcome } from './use-fix';

export function useCheckCards(tripId: string) {
  const plan = useTripPlan(tripId, { version: 'draft-or-current' });
  const guideName = usePlanGuide().name;
  // Her own draft, before the crew has a plan: its issues are listed the same, and each card
  // opens its stop for her to change by hand (the guide's fixes are sent for the crew's plan).
  const onDraft = plan.mode === 'draft';
  const check = usePlanCheck(tripId, onDraft ? plan.versionId : null);
  const byHand: ByHand | undefined = onDraft
    ? (issue) => stopHref(tripId, plan.dayRows, issue)
    : undefined;
  const ctx = useCheckContext(plan);
  const versionId = check.check?.version_id ?? null;
  const runner = useFix(versionId, onDraft);
  const [open, setOpen] = useState<string | null>(null);
  const fixedDays = useFixedDays();
  // A card leaves at once when its fix landed, it was kept, or a fixer screen changed its day.
  const fixes = useMemo(
    () =>
      check.fixes.filter(
        (issue) =>
          !runner.gone.has(issue.id) && (issue.day_id === null || !fixedDays.has(issue.day_id)),
      ),
    [check.fixes, fixedDays, runner.gone],
  );
  const clock = useCallback(
    (instant: string, dayId: string | null = null) => ctx.clock(instant, dayId),
    [ctx],
  );
  const previews = useFixPreviews(tripId, versionId, onDraft ? [] : fixes, ctx.name, clock);
  const organiser = plan.organiser;

  const after = (outcome: FixOutcome, done: string) => {
    const words =
      outcome.kind === 'applied'
        ? onDraft
          ? draftAppliedToast(done)
          : appliedToast(done)
        : outcome.kind === 'sent'
          ? sentToast()
          : outcome.kind === 'stale'
            ? staleToast(guideName)
            : outcome.kind === 'unfit'
              ? unfitToast()
              : outcome.kind === 'guideWorking'
                ? guideWorkingToast(guideName)
                : outcome.kind === 'shared'
                  ? sharedToast()
                  : failedToast();
    toast.show({ id: `plan-check-${outcome.kind}`, ...words });
  };

  const onFix = async (issue: PlanCheckIssue) => {
    const action = fixActionOf(issue, tripId, byHand);
    if (action.kind === 'screen' || action.kind === 'by_hand') {
      router.push(action.href);
      return;
    }
    if (action.kind === 'too_far') {
      setOpen(issue.id);
      return;
    }
    if (action.kind !== 'apply' || issue.fix?.kind !== 'apply') return;
    const op = issue.fix.ops[0];
    const at = op?.after?.starts_at;
    const done =
      op === undefined || typeof at !== 'string'
        ? ''
        : movedLine(ctx.name(op.target), ctx.clock(at, issue.day_id));
    after(await runner.fix(issue), done);
  };

  const cards: IssueCardProps[] = fixes.map((issue) => {
    const words = issueWords(issue, ctx);
    const preview = previews.get(issue.id) ?? {};
    const action = fixActionOf(issue, tripId, byHand);
    const date = ctx.dayDate(issue.day_id);
    const nearer = issue.kind === 'too_far' ? (preview.nearer ?? null) : null;
    return {
      id: issue.id,
      tags: [
        kindTag(issue.kind),
        ...(date === null ? [] : [{ label: dayTag(date), color: kindTag(issue.kind).color }]),
      ],
      title: words.title,
      body: words.body,
      summary: onDraft ? null : fixSummary(issue, ctx, preview),
      fixLabel:
        action.kind === 'none'
          ? null
          : action.kind === 'by_hand'
            ? openByHandLabel(issue.stable_ids.length > 0)
            : fixKindLabel(issue, organiser),
      busy: runner.busy === issue.id,
      onFix: () => void onFix(issue),
      detail:
        open !== issue.id
          ? null
          : {
              line:
                nearer === null
                  ? nearerNone()
                  : nearerDetail(
                      nearer,
                      preview.nearerLegMin ?? null,
                      driveLine(preview.nearerSavedMin ?? 0),
                      driveLine(preview.nearerLegMin ?? 0),
                    ),
              useLabel: nearerUseLabel(),
              onUse:
                nearer === null
                  ? null
                  : () =>
                      void runner.fix(issue).then((outcome) => {
                        setOpen(null);
                        after(outcome, swappedLine(ctx.name(issue.stable_ids[0] ?? ''), nearer));
                      }),
              onKeep: () => {
                setOpen(null);
                // A keep is the crew plan's: on her own draft the card just leaves.
                runner.keep(issue, organiser && !onDraft);
                if (organiser && !onDraft)
                  toast.show({ id: 'plan-check-kept', ...keptToast(guideName) });
              },
            },
    };
  });

  /** Leave it: the issue is known and its card goes (the crew plan's keep for an organiser). */
  const keep = (issue: PlanCheckIssue) => {
    setOpen(null);
    runner.keep(issue, organiser && !onDraft);
    if (organiser && !onDraft) toast.show({ id: 'plan-check-kept', ...keptToast(guideName) });
  };
  return {
    plan,
    versionId,
    check,
    ctx,
    onDraft,
    byHand,
    runner,
    fixes,
    fixedDays,
    organiser,
    guideName,
    cards,
    keep,
  };
}
