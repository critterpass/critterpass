/**
 * Review changes (3e-3, and 7h-7 with the planning redesign on) over one synced change set: the author keeps or drops changes and sends
 * them (or puts them in their own plan only); once it is a vote, the people it touches say yes or
 * no here, and an organiser can put it in at once. Outcomes come back as the rows sync.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire codes and states, never copy. */
import { router } from 'expo-router';
import { useState } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { usePlanningSwitch } from '@/lib/navigation/planning-switch';

import type { SendResult } from '@/data/commands/client';

import { weekdayOf } from '../overview/day-card';
import { guideOf } from '../overview/plan-overview-screen';
import { planRoutes } from '../overview/routes';
import { ChangesReviewScreen } from './changes-review-screen';
import { useChangeset, useChangesetActions } from './data/use-changeset';
import { sideText } from './model/review-model';
import {
  backLabel,
  dayNames,
  reviewSummary,
  reviewTitle,
  sendLabel,
  triggerTag,
} from './review-copy';
import { ReviewView, type ReviewNotice } from './review-view';

function failure(result: SendResult | null): ReviewNotice | null {
  if (result === null) return 'failed';
  if (result.kind === 'unavailable') return 'needs_signal';
  if (result.kind !== 'rejected') return null;
  const reason = (result.detail as { reason?: string; state?: string } | undefined) ?? {};
  if (reason.state === 'stale' || reason.reason === 'stale') return 'stale';
  if (reason.reason === 'supplier_refused') return 'supplier_refused';
  return 'failed';
}

/** With the planning redesign on, the same route shows the section 7 review (7h-7). */
export function ReviewScreen(props: { readonly tripId: string; readonly changesetId: string }) {
  const { redesign } = usePlanningSwitch();
  return redesign ? <ChangesReviewScreen {...props} /> : <ClassicReviewScreen {...props} />;
}

function ClassicReviewScreen({
  tripId,
  changesetId,
}: {
  readonly tripId: string;
  readonly changesetId: string;
}) {
  const view = useChangeset(tripId, changesetId);
  const actions = useChangesetActions(changesetId);
  const locale = useLocale();
  const [busy, setBusy] = useState<'send' | 'personal' | null>(null);
  const [notice, setNotice] = useState<ReviewNotice | null>(null);
  const { plan, row } = view;
  const guide = guideOf(plan);
  const names = new Map(
    plan.members.map((m, index) => [m.user_id, { name: m.display_name ?? '', index }]),
  );
  const people = (uids: readonly string[]) =>
    uids.map((uid) => ({
      key: uid,
      name: names.get(uid)?.name ?? '',
      joinIndex: names.get(uid)?.index ?? 0,
    }));
  const weekday = (date: string | null) => weekdayOf(date, locale);
  const cards = view.cards.map((card) => ({
    key: card.target,
    before: card.before === null ? null : sideText(card.before, view.days, card.movesDay, weekday),
    after: card.after === null ? null : sideText(card.after, view.days, card.movesDay, weekday),
    reason: card.reason,
    people: people(card.people),
    accepted: card.accepted,
  }));
  const kept = view.cards.filter((card) => card.accepted).length;
  const dates = view.cards
    .flatMap((card) => [card.after?.dayNo ?? card.before?.dayNo])
    .map((dayNo) => view.days.find((day) => day.dayNo === dayNo)?.date ?? null)
    .filter((date): date is string => date !== null);
  // The guide's own sets, and the ones a member sent on from a guide suggestion (a trigger).
  const byGuide = row?.author_kind === 'guide' || (row?.trigger ?? 'manual') !== 'manual';
  const editable = view.mine && view.state === 'draft';
  const tally = view.tally;
  const uid = plan.uid ?? '';
  const myVote = tally?.yes.includes(uid) ? 'yes' : tally?.no.includes(uid) ? 'no' : null;
  const stateNotice: ReviewNotice | null =
    view.state === 'stale' ||
    view.state === 'expired' ||
    view.state === 'rejected' ||
    view.state === 'approved' ||
    view.state === 'applying'
      ? view.state
      : null;

  const run = async (which: 'send' | 'personal', fn: () => Promise<SendResult | null>) => {
    setBusy(which);
    setNotice(null);
    const result = await fn();
    setBusy(null);
    setNotice(failure(result));
    if (which === 'personal' && result?.kind === 'applied') router.replace(planRoutes.plan(tripId));
  };

  return (
    <ReviewView
      state={view.status}
      backLabel={backLabel(view.cards)}
      tag={triggerTag(row?.trigger ?? null)}
      guide={guide}
      title={reviewTitle(row?.trigger ?? null, view.cards.length)}
      summary={reviewSummary({
        byGuide,
        guideName: guide.name,
        authorName: names.get(row?.author_id ?? '')?.name ?? null,
        days: dayNames(dates, locale),
        mustDosTouched: view.numbers?.mustDosTouched ?? 0,
      })}
      cards={cards}
      onToggle={editable ? (key, accepted) => void actions.toggle(key, accepted) : null}
      numbers={view.numbers}
      send={
        editable
          ? {
              label: sendLabel(view.prediction),
              disabled: kept === 0,
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
              yes: tally.yes.length,
              needed: tally.needed,
              mine: myVote,
              canVote: myVote === null && tally.eligible.includes(uid),
              onYes: () => void actions.decide('yes'),
              onNo: () => void actions.decide('no'),
            }
          : null
      }
      organiserApply={
        view.state === 'voting' && plan.organiser
          ? () => void actions.applyGroup().then((result) => setNotice(failure(result)))
          : null
      }
      warnings={{
        mustDo: (view.numbers?.mustDosTouched ?? 0) > 0,
        booking: view.cards.some((card) => card.accepted && card.bookingImpact),
      }}
      notice={notice ?? stateNotice}
      onBack={() => (router.canGoBack() ? router.back() : router.replace(planRoutes.plan(tripId)))}
    />
  );
}
