/**
 * What the week picker holds, for every look: the length said ("How many days?"), up to three best
 * windows of that length (none starting within the next few days), the pick (a first day with its
 * ghost of the planned length, or a whole range), and the drag over the calendar that moves either
 * end. Lock takes the ghost as it stands; another tap re-picks its last day.
 */
import { useMemo, useRef, useState } from 'react';

import type { DragHandlers } from './day-grid';
import type { HeatMonth } from './model';
import {
  bestWindows,
  clampLength,
  dragGrip,
  dragTo,
  EMPTY_PICK,
  freeAllDays,
  freeByDate,
  ghostRange,
  rangeLength,
  rangeProblem,
  resizePick,
  shownRange,
  suggestFrom,
  tapDay,
  type DayRange,
  type DragGrip,
  type RangePick,
} from './range';

export interface WeekPickInput {
  readonly months: readonly HeatMonth[];
  readonly startMonth: number;
  readonly total: number;
  readonly lengthDays: number;
  readonly today?: string | undefined;
  readonly initialPick?: RangePick | undefined;
}

interface Drag {
  readonly origin: string;
  readonly grip: DragGrip;
  readonly base: RangePick;
}

export const sameRange = (a: DayRange | null, b: DayRange) =>
  a?.start === b.start && a.end === b.end;

export function useWeekPick({
  months,
  startMonth,
  total,
  lengthDays,
  today,
  initialPick,
}: WeekPickInput) {
  const free = useMemo(() => freeByDate(months), [months]);
  const firstDate = months[0]?.days[0]?.date ?? '';
  const lastDate = months.at(-1)?.days.at(-1)?.date ?? null;
  // How many days the organiser says the trip is; it starts at the planned length.
  const [length, setLength] = useState(() => clampLength(lengthDays));
  const chips = useMemo(
    () => bestWindows(free, length, today === undefined ? firstDate : suggestFrom(today), total),
    [free, length, today, firstDate, total],
  );
  const [pick, setPick] = useState<RangePick>(initialPick ?? EMPTY_PICK);
  // A chip turns the calendar to its month; the key remounts the grid on that page.
  // It opens on the month of the first window it offers, else on this month: never on a later
  // month she would have to page back from to find the days put in front of her.
  const [focus, setFocus] = useState(() => {
    const monthOf = (date: string | undefined) =>
      date === undefined ? -1 : months.findIndex((m) => m.key === date.slice(0, 7));
    const offered = monthOf(chips[0]?.range.start);
    const now = monthOf(today);
    return { month: offered >= 0 ? offered : now >= 0 ? now : startMonth, key: 0 };
  });
  const drag = useRef<Drag | null>(null);
  const ghost = pick.anchor === null ? null : ghostRange(free, pick.anchor, length, lastDate);
  // The ghost locks as it stands; another tap still re-picks its last day.
  const picked = shownRange(pick, ghost);
  const problem = picked === null ? null : rangeProblem(picked);
  const open = (date: string) => today === undefined || date >= today;
  const clampOpen = (date: string) => (today !== undefined && date < today ? today : date);

  const onDrag: DragHandlers = {
    begin: (date) => {
      if (!open(date)) return;
      const grip = dragGrip(pick, date);
      drag.current = { origin: date, grip, base: pick };
      setPick(dragTo(pick, date, grip, date));
    },
    move: (date) => {
      const held = drag.current;
      if (held !== null) setPick(dragTo(held.base, held.origin, held.grip, clampOpen(date)));
    },
    end: () => {
      drag.current = null;
    },
  };
  return {
    free,
    length,
    chips,
    pick,
    focus,
    ghost,
    /** What is shown and what Lock takes: the range, or the ghost after a first tap. */
    picked,
    problem,
    /** Who can make every day of what is picked. */
    freeAll: picked === null ? 0 : freeAllDays(free, picked),
    /** The length chip that reads as chosen. */
    lengthShown: picked === null ? length : rangeLength(picked),
    onDrag,
    open,
    sayLength: (days: number) => {
      setLength(days);
      setPick((current) => resizePick(current, days, lastDate));
    },
    choose: (window: DayRange) => {
      setPick({ anchor: null, range: window });
      const month = months.findIndex((m) => m.key === window.start.slice(0, 7));
      if (month >= 0) setFocus((current) => ({ month, key: current.key + 1 }));
    },
    tap: (date: string) => setPick((current) => tapDay(current, date, ghost)),
    clear: () => setPick(EMPTY_PICK),
  };
}
