/**
 * The review's words built from the change set: the trigger tag, the headline ("4 changes for the
 * rain"), the guide's summary of which days moved and whether a must-do was touched, the back
 * label over the days it spans, and the send button with the yeses it needs.
 */
import { plural, t } from '@lingui/core/macro';

import type { ChangeCard, DeciderPrediction } from './model/review-model';

export function triggerTag(
  trigger: string | null,
): { readonly label: string; readonly tone: 'info' | 'warning' | 'plain' } | null {
  switch (trigger ?? '') {
    case 'weather':
      return {
        label: t({ id: 'plan.review.tag.weather', message: 'Rain forecast' }),
        tone: 'info',
      };
    case 'dropout':
      return { label: t({ id: 'plan.review.tag.dropout', message: 'Dropout' }), tone: 'warning' };
    case 'delay':
      return { label: t({ id: 'plan.review.tag.delay', message: 'Delay' }), tone: 'warning' };
    case 'chat':
      return { label: t({ id: 'plan.review.tag.chat', message: 'From the chat' }), tone: 'plain' };
    case 'redraft':
      return { label: t({ id: 'plan.review.tag.redraft', message: 'Redraft' }), tone: 'plain' };
    case 'swap':
      return { label: t({ id: 'plan.review.tag.swap', message: 'Swap' }), tone: 'plain' };
    default:
      return null;
  }
}

export function reviewTitle(trigger: string | null, count: number): string {
  switch (trigger ?? '') {
    case 'weather':
      return t({
        id: 'plan.review.title.weather',
        message: plural(count, { one: '# change for the rain', other: '# changes for the rain' }),
      });
    case 'dropout':
      return t({
        id: 'plan.review.title.dropout',
        message: plural(count, {
          one: '# change after a dropout',
          other: '# changes after a dropout',
        }),
      });
    case 'delay':
      return t({
        id: 'plan.review.title.delay',
        message: plural(count, { one: '# change for the delay', other: '# changes for the delay' }),
      });
    default:
      return t({
        id: 'plan.review.title.plan',
        message: plural(count, { one: '# change to the plan', other: '# changes to the plan' }),
      });
  }
}

/** "Wednesday and Thursday" for the days the changes land on, in the reader's language. */
export function dayNames(dates: readonly string[], locale: string): string {
  const names = [...new Set(dates)].sort().map((date) =>
    new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
      // Midday UTC keeps the calendar date in every zone.
      // eslint-disable-next-line lingui/no-unlocalized-strings
      new Date(`${date}T12:00:00Z`),
    ),
  );
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names);
}

export function reviewSummary(input: {
  readonly byGuide: boolean;
  readonly guideName: string;
  readonly authorName: string | null;
  readonly days: string;
  readonly mustDosTouched: number;
}): string {
  const { guideName, days } = input;
  const author = input.authorName ?? '';
  const who = input.byGuide
    ? days === ''
      ? t({ id: 'plan.review.summary.guide', message: `${guideName} rearranged a few things.` })
      : t({ id: 'plan.review.summary.guideDays', message: `${guideName} rearranged ${days}.` })
    : days === ''
      ? t({ id: 'plan.review.summary.member', message: `${author} suggested these.` })
      : t({
          id: 'plan.review.summary.memberDays',
          message: `${author} suggested changes to ${days}.`,
        });
  const mustDos =
    input.mustDosTouched === 0
      ? t({
          id: 'plan.review.summary.noMustDo',
          message: 'Nothing anyone marked as a must-do was touched.',
        })
      : t({
          id: 'plan.review.summary.mustDo',
          message: 'One of them touches a must-do.',
        });
  return `${who} ${mustDos}`;
}

/** "Day 3–4" over the days the changes touch, or "Plan" when they name none. */
export function backLabel(cards: readonly ChangeCard[]): string {
  const days = cards
    .flatMap((card) => [card.before?.dayNo, card.after?.dayNo])
    .filter((day): day is number => typeof day === 'number');
  if (days.length === 0) return t({ id: 'plan.review.backPlan', message: 'Plan' });
  const first = Math.min(...days);
  const last = Math.max(...days);
  return first === last
    ? t({ id: 'plan.review.backDay', message: `Day ${first}` })
    : t({ id: 'plan.review.backDays', message: `Day ${first}–${last}` });
}

export function sendLabel(prediction: DeciderPrediction): string {
  if (prediction.kind === 'self') {
    return t({ id: 'plan.review.sendSelf', message: 'Put it in my plan' });
  }
  const needed = prediction.needed;
  return t({
    id: 'plan.review.send',
    message: plural(needed, {
      one: 'Send to crew · needs # yes',
      other: 'Send to crew · needs # yeses',
    }),
  });
}

export type ReviewNotice =
  | 'stale'
  | 'expired'
  | 'rejected'
  | 'approved'
  | 'applying'
  | 'failed'
  | 'supplier_refused'
  | 'needs_signal';

export function noticeText(notice: ReviewNotice): string {
  switch (notice) {
    case 'stale':
      return t({
        id: 'plan.review.notice.stale',
        message: 'The plan changed since this was made, so it can’t go in as it is.',
      });
    case 'expired':
      return t({
        id: 'plan.review.notice.expired',
        message: 'The vote ran out, so the plan stays as it was.',
      });
    case 'rejected':
      return t({
        id: 'plan.review.notice.rejected',
        message: 'The crew said no, so the plan stays as it was.',
      });
    case 'approved':
      return t({ id: 'plan.review.notice.approved', message: 'Done. It’s in everyone’s plan.' });
    case 'applying':
      return t({
        id: 'plan.review.notice.applying',
        message: 'Approved. Putting it into the plan now.',
      });
    case 'supplier_refused':
      return t({
        id: 'plan.review.notice.supplierRefused',
        message: 'The supplier won’t move that booking, so this can’t go in.',
      });
    case 'needs_signal':
      return t({
        id: 'plan.review.notice.needsSignal',
        message: 'Sending needs signal. Try again once you’re back online.',
      });
    case 'failed':
      return t({
        id: 'plan.review.notice.failed',
        message: 'That didn’t go through. Nothing changed; try again.',
      });
  }
}
