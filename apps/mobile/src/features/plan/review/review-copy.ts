/**
 * The review's words built from the change set: the headline ("4 changes for the rain"), the send
 * button with the yeses it needs, and what went wrong with a send.
 */
import { plural, t } from '@lingui/core/macro';

import type { DeciderPrediction } from './model/review-model';

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
