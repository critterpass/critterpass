/**
 * The plan check (7h-1) on the trip's synced check: its issues worst first with what each FIX
 * would do, a FIX that applies (organiser, with an undo in the trip feed) or is suggested (member),
 * the bigger fixes on their own screens, FIX ALL into one review (7h-7), the balance row for
 * organisers and, for a member an organiser asked privately, the ask on top.
 */
/* eslint-disable lingui/no-unlocalized-strings -- toast ids, never copy. */
import type { PlanCheckIssue } from '@cp/domain';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { usePlanCheck } from '@/data/checks/use-plan-check';
import { useCommand } from '@/data/commands/use-command';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { planRoutes } from '@/features/plan/overview/routes';
import { useMotionMode } from '@/motion/motion-mode';
import { toast } from '@/motion/island-toast';

import { AskCard } from './ask-card';
import {
  appliedToast,
  backTripLabel,
  balanceRowLabel,
  checkBody,
  checkingLabel,
  checkTitle,
  clearNotice,
  failedNotice,
  failedToast,
  fixAllLabel,
  fixLabel,
  movedLine,
  nearerDetail,
  nearerNone,
  nearerUseLabel,
  runningNotice,
  sentToast,
  staleToast,
  swappedLine,
} from './check-copy';
import { CheckView } from './check-view';
import { answerMemberAskCommand } from './commands';
import { fixAll } from './data/fixer-api';
import { useCheckContext } from './data/use-check-context';
import { useFixPreviews } from './data/use-fix-previews';
import { useMemberAsks } from './data/use-member-ask';
import { checkedAgo, dayTag, driveLine } from './format';
import type { IssueCardProps } from './issue-card';
import { fixSummary, issueWords, kindTag, knowLine } from './issue-copy';
import { checkRoutes } from './routes';
import { fixActionOf, useFix, type FixOutcome } from './use-fix';

export function CheckScreen({ tripId }: { readonly tripId: string }) {
  const plan = useTripPlan(tripId);
  const check = usePlanCheck(tripId);
  const ctx = useCheckContext(plan);
  const [motionMode] = useMotionMode();
  const versionId = check.check?.version_id ?? null;
  const runner = useFix(versionId);
  const answer = useCommand(answerMemberAskCommand);
  const asks = useMemberAsks(tripId);
  const [open, setOpen] = useState<string | null>(null);
  const [fixingAll, setFixingAll] = useState(false);
  const fixes = useMemo(
    () => check.fixes.filter((issue) => !runner.gone.has(issue.id)),
    [check.fixes, runner.gone],
  );
  const clock = useCallback(
    (instant: string, dayId: string | null = null) => ctx.clock(instant, dayId),
    [ctx],
  );
  const previews = useFixPreviews(tripId, versionId, fixes, ctx.name, clock);
  const organiser = plan.organiser;

  const after = (outcome: FixOutcome, done: string) => {
    const words =
      outcome.kind === 'applied'
        ? appliedToast(done)
        : outcome.kind === 'sent'
          ? sentToast()
          : outcome.kind === 'stale'
            ? staleToast()
            : failedToast();
    toast.show({ id: `plan-check-${outcome.kind}`, ...words });
  };

  const onFix = async (issue: PlanCheckIssue) => {
    const action = fixActionOf(issue, tripId);
    if (action.kind === 'screen') {
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
    const action = fixActionOf(issue, tripId);
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
      summary: fixSummary(issue, ctx, preview),
      fixLabel: action.kind === 'none' ? null : fixLabel(organiser),
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
              onClose: () => setOpen(null),
            },
    };
  });

  const fixable = fixes.filter((issue) => fixActionOf(issue, tripId).kind !== 'none');
  const status = check.check?.status ?? null;
  const running = status === 'queued' || status === 'running';
  const notice =
    !check.loaded || check.check === null
      ? check.loaded
        ? runningNotice()
        : null
      : status === 'failed'
        ? failedNotice()
        : fixes.length === 0 && check.know.length === 0
          ? running
            ? runningNotice()
            : clearNotice()
          : null;
  const mine = asks.find((ask) => ask.memberId === plan.uid && ask.status === 'open') ?? null;
  const asker = plan.members.find((member) => member.uid === mine?.askedBy)?.name ?? '';

  return (
    <CheckView
      backLabel={backTripLabel()}
      onBack={() => router.back()}
      status={
        running || check.check?.checked_at == null
          ? checkingLabel()
          : checkedAgo(check.check.checked_at, new Date())
      }
      state={check.loaded ? 'ready' : 'loading'}
      title={checkTitle(fixes.length, check.know.length)}
      body={checkBody(plan.dayRows.length)}
      notice={notice}
      cards={cards}
      know={check.know.map((issue) => knowLine(issue, ctx))}
      ask={
        mine === null ? null : (
          <AskCard
            asker={asker}
            places={mine.places}
            onYes={() => void answer.send({ ask_id: mine.id, accept: true })}
            onNo={() => void answer.send({ ask_id: mine.id, accept: false })}
          />
        )
      }
      balance={
        organiser
          ? {
              label: `${balanceRowLabel()} ›`,
              onPress: () => router.push(checkRoutes.balance(tripId)),
            }
          : null
      }
      fixAll={
        fixable.length === 0
          ? null
          : {
              label: fixAllLabel(fixable.length),
              busy: fixingAll,
              onPress: () => {
                setFixingAll(true);
                void fixAll(
                  tripId,
                  fixable.map((issue) => issue.id),
                ).then((changesetId) => {
                  setFixingAll(false);
                  if (changesetId === null) {
                    toast.show({ id: 'plan-check-fix-all', ...failedToast() });
                    return;
                  }
                  router.push(planRoutes.review(tripId, changesetId));
                });
              },
            }
      }
      reducedMotion={motionMode !== 'full'}
    />
  );
}
