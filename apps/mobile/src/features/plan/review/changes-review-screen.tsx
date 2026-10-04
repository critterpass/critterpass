/**
 * Review changes (7h-7): every change Tokek makes lands here first, from a fix, a swap or placing
 * ideas. The author unticks what they don't want (the totals recount) and sends the whole set to
 * the crew as one vote, or puts it in their own plan only; once it is a vote the people it touches
 * say yes or no here. Ideas Tokek left out are listed under NEEDS YOU with a way to see why.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { hrefFor } from '@/lib/navigation/screen-registry';
import { useLocale } from '@/lib/i18n/use-locale';

import type { SendResult } from '@/data/commands/client';

import { usePlanGuide } from '../plan-guide';
import { dayTileColour, weekdayOf } from '../overview/day-card';
import { planRoutes } from '../overview/routes';
import {
  backIdeasLabel,
  calmSummary,
  changesHeadline,
  leftLine,
  needsMoveExplainer,
  onlyYouLabel,
  placedHeadline,
  placedReason,
  tallyLine,
} from './changes-copy';
import { ChangesReviewView, type ChangeRow, type NeedsYouRow } from './changes-review-view';
import { ChangesTotals } from './changes-totals';
import { useChangeset, useChangesetActions } from './data/use-changeset';
import { useReviewExtras } from './data/use-review-extras';
import { opsOf } from './model/changes-ops';
import { backLabel, noticeText, sendLabel, type ReviewNotice } from './review-copy';

/* eslint-disable lingui/no-unlocalized-strings -- design ids and op kinds, never copy. */
const SPLIT_IDS = ['7e-3', '7e-1', '3d-3'] as const;
const PLACE_IDS = ['7e-1', '3d-3'] as const;
const IDEAS_ID = '7f-2';
/* eslint-enable lingui/no-unlocalized-strings */

/* eslint-disable lingui/no-unlocalized-strings -- notice codes, never copy. */
function failure(result: SendResult | null): ReviewNotice | null {
  if (result === null) return 'failed';
  if (result.kind === 'unavailable') return 'needs_signal';
  return result.kind === 'rejected' ? 'failed' : null;
}
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
  const [busy, setBusy] = useState<'send' | 'personal' | null>(null);
  const [notice, setNotice] = useState<ReviewNotice | null>(null);
  const [explained, setExplained] = useState<ReadonlySet<string>>(new Set());
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
  const names = new Map(view.baseItems.map((item) => [item.stableId, item.label]));
  const stopName = (stableId: string) => names.get(stableId) ?? null;
  const ideas = row?.trigger === 'ideas';
  const editable = view.mine && view.state === 'draft';
  const left = extras.left ?? [];

  const rows: ChangeRow[] = view.cards.map((card) => {
    const side = card.after ?? card.before;
    const dayNo = side?.dayNo ?? card.before?.dayNo ?? null;
    const date = view.days.find((day) => day.dayNo === dayNo)?.date ?? null;
    const mark = card.op === 'add' ? '+' : card.op === 'remove' ? '−' : '→';
    const why = ideas
      ? placedReason(extras.placedReasons.get(card.target) ?? [], stopName)
      : card.reason;
    return {
      key: card.target,
      dayTag: weekdayOf(date, locale).toUpperCase(),
      dayColor: dayTileColour(dayNo ?? 1),
      title: `${mark} ${(side?.label ?? '').toUpperCase()}`,
      detail: [side?.time ?? '', why].filter((part) => part !== '').join(' · '),
      accepted: card.accepted,
    };
  });
  const needsYou: NeedsYouRow[] = left.map((idea) => {
    const stop = idea.needsMove === null ? null : stopName(idea.needsMove);
    return {
      key: idea.ideaId,
      name: idea.name.toUpperCase(),
      line: leftLine(idea, stopName),
      explainer: explained.has(idea.ideaId) ? needsMoveExplainer(stop, guideName) : null,
      onSee: () => {
        if (idea.reason === 'needs_move') {
          setExplained((current) => new Set([...current, idea.ideaId]));
          return;
        }
        const params = { tripId, placeId: idea.poiId ?? '' };
        const ids = idea.reason === 'split' ? SPLIT_IDS : PLACE_IDS;
        const href =
          idea.poiId === null
            ? hrefFor(IDEAS_ID, { tripId })
            : ids.map((id) => hrefFor(id, params)).find((found) => found !== undefined);
        if (href !== undefined) router.push(href);
      },
    };
  });

  const calm =
    (view.numbers?.bookingsMoved ?? 0) === 0 && (view.numbers?.mustDosTouched ?? 0) === 0;
  const tally = view.tally;
  const uid = plan.uid ?? '';
  const voted = tally?.yes.includes(uid) === true || tally?.no.includes(uid) === true;
  const run = async (which: 'send' | 'personal', fn: () => Promise<SendResult | null>) => {
    setBusy(which);
    setNotice(null);
    const result = await fn();
    setBusy(null);
    setNotice(failure(result));
    if (which === 'personal' && result?.kind === 'applied') router.replace(planRoutes.plan(tripId));
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
  const yes = tally?.yes.length ?? 0;
  const needed = tally?.needed ?? 0;

  return (
    <ChangesReviewView
      state={view.status}
      backLabel={ideas ? backIdeasLabel() : backLabel(view.cards)}
      onBack={() => (router.canGoBack() ? router.back() : router.replace(planRoutes.plan(tripId)))}
      onlyYou={editable ? onlyYouLabel() : null}
      title={
        ideas
          ? placedHeadline(view.cards.length, left.length)
          : changesHeadline(row?.trigger ?? null, view.cards.length)
      }
      summary={
        calm
          ? calmSummary()
          : t({
              id: 'plan.review.summary.touches',
              message: 'Some of this moves a booking or a must-do. Look before you send.',
            })
      }
      rows={rows}
      onToggle={editable ? (key, next) => void actions.toggle(key, next) : null}
      needsYou={needsYou}
      totals={<ChangesTotals numbers={view.numbers} drivingMin={extras.drivingDeltaMin} />}
      send={
        editable
          ? {
              label: sendLabel(view.prediction).toUpperCase(),
              disabled: !view.cards.some((card) => card.accepted),
              busy: busy === 'send',
              onPress: () => void run('send', actions.send),
            }
          : null
      }
      personal={
        view.state === 'draft' || view.state === 'voting'
          ? {
              busy: busy === 'personal',
              onPress: () => void run('personal', actions.applyPersonal),
            }
          : null
      }
      vote={
        view.state === 'voting' && tally !== null
          ? {
              line: tallyLine(yes, needed),
              canVote: !voted && tally.eligible.includes(uid),
              onYes: () => void actions.decide('yes'),
              onNo: () => void actions.decide('no'),
            }
          : null
      }
      notice={shownNotice === null ? null : noticeText(shownNotice)}
    />
  );
}
