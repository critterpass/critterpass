/**
 * The running-late screen's model (3k-9) for a lateness only this phone knows about, because the
 * traveller has just said it: push the stop (when that is hers to do) and skip it just for her,
 * push first. Pure.
 */
import type { LateOption } from '@cp/domain';

import type { LateModel } from './model';

const option = (id: LateOption['id'], facts: LateOption['facts']): LateOption => ({
  id,
  label: '',
  detail: '',
  offered: true,
  recommended: false,
  split: false,
  new_start: null,
  arrive_at: null,
  per_person_minor: 0,
  currency: null,
  supplier: 'none',
  vendor_name: null,
  facts,
});

export function saidLateModel(input: {
  readonly title: string;
  readonly minutes: number;
  /** The stop's start and where the push would put it, as clock text. */
  readonly start: string;
  readonly to: string;
  readonly me: string | null;
  readonly canPush: boolean;
}): LateModel {
  const options = [
    ...(input.canPush ? [option('push', { title: input.title, to: input.to })] : []),
    option('skip', { title: input.title }),
  ];
  return {
    lateMin: input.minutes,
    start: input.start,
    eta: input.to,
    title: input.title,
    stale: false,
    open: true,
    options,
    recommended: options[0]?.id ?? null,
    chosen: null,
    vendor: null,
    partyIds: input.me === null ? [] : [input.me],
    waitingIds: [],
    role: 'late',
  };
}
