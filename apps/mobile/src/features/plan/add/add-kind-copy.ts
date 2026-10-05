/**
 * WHY {time} with the time of day the place is for said first ("Best around sunset", "Timed for a
 * meal"): the phone reads it with the same rule the server suggests by, so a suggested time always
 * comes with its reason. Left out once the person picks their own time.
 */
import type { DayFit } from '@cp/domain';
import { kindTimeOf, type FitPlace, type KindTime } from '@cp/planner';
import { t } from '@lingui/core/macro';

import type { Reason } from '@/ui/planning';

import { reasonTiles } from './add-copy';

export function kindTile(kind: KindTime | null): Reason | null {
  switch (kind) {
    case 'sunset':
      return {
        key: 'kind',
        icon: 'sun',
        text: t({ id: 'plan.add.why.sunset', message: 'Best around sunset' }),
      };
    case 'evening':
      return {
        key: 'kind',
        icon: 'cal',
        text: t({ id: 'plan.add.why.evening', message: 'Best in the evening' }),
      };
    case 'after_dark':
      return {
        key: 'kind',
        icon: 'cal',
        text: t({ id: 'plan.add.why.afterDark', message: 'Best after dark' }),
      };
    case 'morning':
      return {
        key: 'kind',
        icon: 'sun',
        text: t({ id: 'plan.add.why.morning', message: 'Best in the morning' }),
      };
    case 'meal':
      return {
        key: 'kind',
        icon: 'food',
        text: t({ id: 'plan.add.why.meal', message: 'Timed for a meal' }),
      };
    case null:
      return null;
  }
}

/** The WHY tiles for the shown fit, led by what time of day the place is for. */
export interface WhyInput {
  readonly day: DayFit | null;
  readonly month: string;
  readonly stopName: (stableId: string) => string | null;
  readonly place: FitPlace | null;
  readonly tz: string;
  readonly lengthMin: number;
  /** The person chose the time: the place's own time of day is not why. */
  readonly timePicked: boolean;
}

export function whyTiles(input: WhyInput): Reason[] {
  const tiles = reasonTiles(input.day, input.month, input.stopName);
  const blocked = input.day === null || input.day.grade === 'no';
  const kind =
    input.place === null || input.timePicked || blocked
      ? null
      : kindTile(kindTimeOf(input.place, input.tz, input.lengthMin));
  return kind === null ? tiles : [kind, ...tiles].slice(0, 4);
}
