/**
 * The other day Tokek points to from Add to plan: a place that has its own time of day (a sunset
 * temple, a bar, a meal) and is shown outside it, on a day with no room then, points to the
 * nearest day that has room at that time ("Better on Thu 22 Oct at 17:30"); any other place to
 * the guide's best day when the sheet opened on another ("Tokek would pick Fri 23 Oct").
 */
import type { PlaceFit } from '@cp/domain';
import { kindWindows, minutesOutside, type FitPlace } from '@cp/planner';
import { t } from '@lingui/core/macro';

import { minutesOf, type AddChoice } from './add-model';
import { guidePickLabel } from './add-states-copy';

export interface OtherDay {
  readonly dayNo: number;
  /** The start that day, when it is a better time rather than only a better day. */
  readonly startMin: number | null;
}

export function otherDay(input: {
  readonly fit: PlaceFit | null;
  readonly place: FitPlace | null;
  readonly choice: AddChoice | null;
  readonly days: readonly { readonly dayNo: number; readonly date: string }[];
  readonly tz: string;
  readonly lengthMin: number;
}): OtherDay | null {
  const { fit, place, choice, tz } = input;
  if (fit === null || choice === null) return null;
  const dateOf = (dayNo: number) => input.days.find((day) => day.dayNo === dayNo)?.date ?? null;
  const own = (dayNo: number) => {
    const date = dateOf(dayNo);
    return place === null || date === null ? [] : kindWindows(place, date, tz, input.lengthMin).own;
  };
  const outside =
    own(choice.dayNo).length > 0 && minutesOutside(own(choice.dayNo), choice.startMin) > 0;
  if (outside && !choice.timePicked) {
    const inTime = fit.days.flatMap((day) => {
      if (day.slot === null || day.grade === 'no' || day.day_no === choice.dayNo) return [];
      const start = minutesOf(day.slot.starts_at, tz);
      return minutesOutside(own(day.day_no), start) === 0
        ? [{ dayNo: day.day_no, startMin: start }]
        : [];
    });
    const near = [...inTime].sort(
      (a, b) => Math.abs(a.dayNo - choice.dayNo) - Math.abs(b.dayNo - choice.dayNo),
    )[0];
    if (near !== undefined) return near;
  }
  const best = fit.best;
  if (best === null || best.day_no === choice.dayNo) return null;
  return { dayNo: best.day_no, startMin: null };
}

/** "Better on Thu 22 Oct at 17:30", or "Tokek would pick Fri 23 Oct". */
export function otherDayLabel(
  other: OtherDay,
  guide: string,
  dayLabel: string,
  time: string,
): string {
  return other.startMin === null
    ? guidePickLabel(guide, dayLabel)
    : t({ id: 'plan.add.betterOn', message: `Better on ${dayLabel} at ${time}` });
}

/** The link under the day chips for `other`: its words, and the choice a tap moves the block to. */
export function otherDayPick(
  other: OtherDay | null,
  choice: AddChoice | null,
  how: {
    readonly label: (other: OtherDay) => string;
    readonly toDay: (from: AddChoice, dayNo: number) => AddChoice;
    readonly onPick: (next: AddChoice) => void;
  },
): { readonly label: string; readonly onPress: () => void } | null {
  if (other === null || choice === null) return null;
  const next: AddChoice =
    other.startMin === null
      ? how.toDay(choice, other.dayNo)
      : { dayNo: other.dayNo, startMin: other.startMin, timePicked: false };
  return { label: how.label(other), onPress: () => how.onPick(next) };
}
