/**
 * The plan check (7h-1) on the trip's synced check: its issues worst first with what each FIX
 * would do, a FIX that applies (organiser, with an undo in the trip feed) or is suggested (member),
 * the bigger fixes on their own screens, FIX ALL into one review (7h-7), the balance row for
 * organisers and, for a member an organiser asked privately, the ask on top.
 */
import { router } from 'expo-router';

import { goBackOr } from '@/lib/navigation/back';
import { useState, type ComponentType } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { planRoutes } from '@/features/plan/overview/routes';
import { useMotionMode } from '@/motion/motion-mode';
import { toast } from '@/motion/island-toast';

import { AskCard, type AskCardProps } from './ask-card';
import {
  backTripLabel,
  balanceRowLabel,
  checkBody,
  checkingLabel,
  checkingTitle,
  checkTitle,
  clearNotice,
  failedNotice,
  failedToast,
  fixAllLabel,
  runningNotice,
} from './check-copy';
import { CheckView, type CheckViewProps } from './check-view';
import { answerMemberAskCommand } from './commands';
import { fixAll } from './data/fixer-api';
import { useMemberAsks } from './data/use-member-ask';
import { checkedAgo } from './format';
import { knowLine } from './issue-copy';
import { checkRoutes } from './routes';
import { useCheckCards } from './use-check-cards';
import { fixActionOf } from './use-fix';

export function CheckScreen({
  tripId,
  View: Look = CheckView,
  Ask = AskCard,
}: {
  readonly tripId: string;
  /** How the check is drawn; the logic is the same in every look. @default the current look */
  readonly View?: ComponentType<CheckViewProps>;
  /** A private ask drawn in the same look. @default the current look */
  readonly Ask?: ComponentType<AskCardProps>;
}) {
  const {
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
  } = useCheckCards(tripId);
  const [motionMode] = useMotionMode();
  const answer = useCommand(answerMemberAskCommand);
  const asks = useMemberAsks(tripId);
  const [fixingAll, setFixingAll] = useState(false);
  const fixable = onDraft
    ? []
    : fixes.filter((issue) => fixActionOf(issue, tripId, byHand).kind !== 'none');
  const status = check.check?.status ?? null;
  // Waiting for its next run: the server says so once the new plan syncs; until then a fix that
  // just landed on the version this check read, or a day a fixer screen changed, says it here.
  const running =
    check.checking ||
    (runner.fixedOn !== null && runner.fixedOn === versionId) ||
    check.fixes.some((issue) => issue.day_id !== null && fixedDays.has(issue.day_id));
  const notice =
    !check.loaded || check.check === null
      ? check.loaded
        ? runningNotice(guideName)
        : null
      : status === 'failed'
        ? failedNotice()
        : fixes.length === 0 && check.know.length === 0
          ? running
            ? runningNotice(guideName)
            : clearNotice(guideName)
          : null;
  const mine = asks.find((ask) => ask.memberId === plan.uid && ask.status === 'open') ?? null;
  const asker = plan.members.find((member) => member.uid === mine?.askedBy)?.name ?? '';

  return (
    <Look
      backLabel={backTripLabel()}
      onBack={() => goBackOr(planRoutes.plan(tripId))}
      status={
        running || check.check?.checked_at == null
          ? checkingLabel()
          : checkedAgo(check.check.checked_at, new Date())
      }
      state={check.loaded ? 'ready' : 'loading'}
      title={
        check.check?.checked_at == null
          ? checkingTitle()
          : checkTitle(fixes.length, check.know.length)
      }
      body={checkBody(plan.dayRows.length)}
      notice={notice}
      cards={cards}
      know={check.know.map((issue) => knowLine(issue, ctx))}
      ask={
        mine === null ? null : (
          <Ask
            asker={asker}
            places={mine.places}
            onYes={() => void answer.send({ ask_id: mine.id, accept: true })}
            onNo={() => void answer.send({ ask_id: mine.id, accept: false })}
          />
        )
      }
      balance={
        organiser && !onDraft
          ? {
              label: balanceRowLabel(),
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
