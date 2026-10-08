/**
 * Review changes (7h-7): every change Tokek makes lands here first, from a fix, a swap or placing
 * ideas, and so does a change a crew member suggested. The author unticks what they don't want
 * (the totals recount). An organiser puts the set straight into the plan (with UNDO) or asks the
 * crew first; a member sends it to the crew as one vote; either can keep it to their own plan.
 * Once it is a vote the people it touches say yes or no here, and their answer shows at once with
 * the tally and when the vote closes. The summary only says the set fits when it was checked
 * against the plan; otherwise it names what would collide. Ideas Tokek left out are listed under
 * NEEDS YOU with a way to see why.
 */
import { upper } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';

import { goBackOr } from '@/lib/navigation/back';
import { useMemo, useState } from 'react';

import type { SendResult } from '@/data/commands/client';
import { useCommand } from '@/data/commands/use-command';
import { undoPlanEditOnline } from '@/data/plan/commands';
import type { UndoOutcome } from '@/data/plan/use-plan-editor';
import { withDriverReply } from '@/features/drivers';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';

import { announceUndo } from '../day/edit-copy';
import { dayName } from '../day/format';
import { dayRoute } from '../day/routes';
import { usePlanGuide } from '../plan-guide';
import { planRoutes } from '../overview/routes';
import {
  addNowLabel,
  appliedToast,
  askCrewLabel,
  backIdeasLabel,
  changesHeadline,
  onlyYouLabel,
  placedHeadline,
  sentToast,
} from './changes-copy';
import { ChangesReviewView } from './changes-review-view';
import { changeRows, needsYouRows } from './changes-rows';
import {
  backCheckLabel,
  backPlainLabel,
  doneNotice,
  seeDayLabel,
  summaryLine,
  voteLine,
} from './changes-state-copy';
import { ChangesTotals } from './changes-totals';
import { useChangeset, useChangesetActions } from './data/use-changeset';
import { useReviewExtras } from './data/use-review-extras';
import { collisionsAfter } from './model/after-fit';
import { opsOf } from './model/changes-ops';
import { noticeText, sendLabel, type ReviewNotice } from './review-copy';

/* eslint-disable lingui/no-unlocalized-strings -- notice codes and toast ids, never copy. */
function failure(result: SendResult | null): ReviewNotice | null {
  if (result === null) return 'failed';
  if (result.kind === 'unavailable') return 'needs_signal';
  return result.kind === 'rejected' ? 'failed' : null;
}
function undoOutcome(result: SendResult): UndoOutcome {
  if (result.kind === 'applied') return 'undone';
  return result.kind === 'unavailable' ? 'unavailable' : 'moved_on';
}
const SENT_TOAST = 'plan-review-sent';
const APPLIED_TOAST = 'plan-review-applied';
/* eslint-enable lingui/no-unlocalized-strings */

export function ChangesReviewScreen({
  tripId,
  changesetId,
}: {
  readonly tripId: string;
  readonly changesetId: string;
}) {
  const guideName = usePlanGuide().name;
  const locale = useLocale();
  const view = useChangeset(tripId, changesetId);
  const actions = useChangesetActions(changesetId);
  const takeBack = useCommand(undoPlanEditOnline);
  const [busy, setBusy] = useState<'send' | 'personal' | null>(null);
  const [notice, setNotice] = useState<ReviewNotice | null>(null);
  const [explained, setExplained] = useState<ReadonlySet<string>>(new Set());
  // My answer the moment I give it: the ballot's own row follows once it has synced.
  const [answered, setAnswered] = useState<'yes' | 'no' | null>(null);
  const { row, plan } = view;
  const accepted = useMemo(
    () => new Map(view.cards.map((card) => [card.target, card.accepted])),
    [view.cards],
  );
  const ops = useMemo(() => opsOf(row?.ops ?? null, accepted), [row?.ops, accepted]);
  const extras = useReviewExtras({
    tripId,
    changesetId,
    baseVersionId: row?.base_version_id ?? null,
    baseItems: view.baseItems,
    ops,
  });
  const crew = useMemo(
    () => plan.members.filter((m) => m.status === 'active').map((m) => m.user_id),
    [plan.members],
  );
  const collisions = useMemo(
    () => collisionsAfter(view.baseItems, ops, crew, plan.trip?.tz ?? 'UTC'),
    [view.baseItems, ops, crew, plan.trip?.tz],
  );
  const names = new Map(view.baseItems.map((item) => [item.stableId, item.label]));
  for (const card of view.cards) {
    const label = card.after?.label ?? card.before?.label;
    if (label !== undefined && !names.has(card.target)) names.set(card.target, label);
  }
  const stopName = (stableId: string) => names.get(stableId) ?? null;
  const ideas = row?.trigger === 'ideas';
  const editable = view.mine && view.state === 'draft';
  const organiser = plan.organiser && !plan.readOnly;
  const left = extras.left ?? [];
  const uid = plan.uid ?? '';
  const author = plan.members.find((m) => m.user_id === row?.author_id);
  const keeps = view.cards.some((card) => card.accepted);
  // A driver is the whole crew's: only a plan item change can be kept to my own plan.
  const mineOnly = view.cards.some((card) => card.accepted && card.driverPick === null);
  const changedDay =
    view.cards
      .filter((card) => card.accepted)
      .map((card) => card.after?.dayNo ?? card.before?.dayNo ?? null)
      .find((dayNo): dayNo is number => dayNo !== null) ?? null;
  const changedDate = view.days.find((day) => day.dayNo === changedDay)?.date ?? null;
  const toChangedDay = () =>
    changedDay === null ? planRoutes.plan(tripId) : dayRoute(tripId, changedDay);

  const calm =
    (view.numbers?.bookingsMoved ?? 0) === 0 && (view.numbers?.mustDosTouched ?? 0) === 0;
  const tally = view.tally;
  const mine =
    tally?.yes.includes(uid) === true ? 'yes' : tally?.no.includes(uid) === true ? 'no' : answered;
  const run = async (which: 'send' | 'personal', fn: () => Promise<SendResult | null>) => {
    setBusy(which);
    setNotice(null);
    const result = await fn();
    setBusy(null);
    setNotice(failure(result));
    if (result?.kind !== 'applied') return;
    if (which === 'personal') router.replace(planRoutes.plan(tripId));
    else {
      toast.dismiss();
      toast.show({ id: SENT_TOAST, ...sentToast() });
    }
  };
  /** An organiser puts the accepted changes straight into the plan, with UNDO. */
  const addNow = async () => {
    setBusy('send');
    setNotice(null);
    const result = await actions.applyGroup();
    setBusy(null);
    setNotice(failure(result));
    if (result?.kind !== 'applied') return;
    const { opId } = result;
    toast.dismiss();
    toast.show({
      id: APPLIED_TOAST,
      title: appliedToast(view.cards.filter((card) => card.accepted).length, ideas),
      action: {
        label: t({ id: 'plan.edit.undo', message: 'UNDO' }),
        onPress: () => {
          toast.dismiss();
          void takeBack
            .send({ trip_id: tripId, op_id: opId })
            .then((undone) => announceUndo(undoOutcome(undone)));
        },
      },
    });
    router.replace(toChangedDay());
  };
  const decide = (decision: 'yes' | 'no') => {
    setAnswered(decision);
    void actions.decide(decision).then((result) => {
      const failed = failure(result);
      if (failed === null) return;
      setAnswered(null);
      setNotice(failed);
    });
  };
  const stateNotice: ReviewNotice | null =
    view.state === 'stale' ||
    view.state === 'expired' ||
    view.state === 'rejected' ||
    view.state === 'approved' ||
    view.state === 'applying'
      ? view.state
      : null;
  const shownNotice = notice ?? stateNotice;
  const done = shownNotice === 'approved' || shownNotice === 'applying';
  const yes =
    (tally?.yes.length ?? 0) + (answered === 'yes' && tally?.yes.includes(uid) !== true ? 1 : 0);

  return (
    <ChangesReviewView
      state={view.status}
      backLabel={
        ideas ? backIdeasLabel() : row?.trigger === 'check' ? backCheckLabel() : backPlainLabel()
      }
      onBack={() => goBackOr(planRoutes.plan(tripId))}
      onlyYou={editable ? onlyYouLabel() : null}
      title={
        ideas
          ? placedHeadline(view.cards.length, left.length)
          : changesHeadline(row?.trigger ?? null, view.cards.length)
      }
      summary={summaryLine({
        author:
          row?.author_kind === 'user' && row.author_id !== uid
            ? (author?.display_name ?? null)
            : null,
        collision: collisions[0] ?? null,
        stopName,
        calm,
        ideas,
      })}
      rows={changeRows({
        cards: view.cards,
        days: view.days,
        locale,
        placedReasons: ideas ? extras.placedReasons : null,
        stopName,
      })}
      onToggle={editable ? (key, next) => void actions.toggle(key, next) : null}
      needsYou={needsYouRows({
        left,
        tripId,
        explained,
        stopName,
        guideName,
        onExplain: (ideaId) => setExplained((current) => new Set([...current, ideaId])),
        onOpen: (href) => router.push(href),
      })}
      totals={withDriverReply(
        row,
        <ChangesTotals numbers={view.numbers} drivingMin={extras.drivingDeltaMin} />,
      )}
      send={
        editable
          ? {
              label: organiser ? addNowLabel(ideas) : upper(sendLabel(view.prediction), locale),
              disabled: !keeps,
              busy: busy === 'send',
              onPress: () => void (organiser ? addNow() : run('send', actions.send)),
            }
          : null
      }
      ask={
        editable && organiser && view.prediction.kind === 'vote'
          ? {
              label: askCrewLabel(),
              disabled: !keeps || busy !== null,
              onPress: () => void run('send', actions.send),
            }
          : null
      }
      personal={
        mineOnly && (view.state === 'draft' || view.state === 'voting')
          ? {
              busy: busy === 'personal',
              onPress: () => void run('personal', actions.applyPersonal),
            }
          : null
      }
      vote={
        view.state === 'voting' && tally !== null
          ? {
              line: voteLine({
                mine,
                author: view.mine,
                yes,
                needed: tally.needed,
                closesAt: view.closesAt,
                now: new Date(),
              }),
              canVote: mine === null && tally.eligible.includes(uid),
              onYes: () => decide('yes'),
              onNo: () => decide('no'),
            }
          : null
      }
      notice={
        shownNotice === null
          ? null
          : shownNotice === 'approved'
            ? doneNotice(crew.length <= 1)
            : noticeText(shownNotice)
      }
      seeDay={
        done && changedDay !== null
          ? {
              label: seeDayLabel(
                changedDate === null ? String(changedDay) : dayName(locale, changedDate),
              ),
              onPress: () => router.replace(toChangedDay()),
            }
          : null
      }
    />
  );
}
