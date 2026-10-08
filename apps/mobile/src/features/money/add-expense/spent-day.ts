/**
 * The day an expense was spent, as the WHEN chips and the details row count it: whole calendar
 * days back from today on this phone (0 is today, 1 yesterday), with the time of day kept when the
 * day is moved.
 */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';

const DAY_MS = 86_400_000;

/** How many days back the day chips reach. */
export const DAY_CHIPS = 7;

/** The same time of day, `daysBack` days earlier. */
export function shiftDays(now: Date, daysBack: number): string {
  return new Date(now.getTime() - daysBack * DAY_MS).toISOString();
}

function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Calendar days from the day it was spent to today; 0 for now, a time not set or a day ahead. */
export function daysBackOf(spentAt: string | null, now: Date): number {
  if (spentAt === null) return 0;
  const spent = new Date(spentAt);
  if (Number.isNaN(spent.getTime())) return 0;
  return Math.max(0, Math.round((dayStart(now) - dayStart(spent)) / DAY_MS));
}

/**
 * What picking a day chip sets: nothing when that day is already the expense's, "now" (null) for
 * today on a new expense, and otherwise this time of day on the day picked. An edit gets a real
 * time for today too, so moving a back-dated expense to today is a change that is sent.
 */
export function spentAtForDay(input: {
  readonly daysBack: number;
  readonly current: string | null;
  readonly editing: boolean;
  readonly now: Date;
}): { readonly at: string | null } | null {
  if (input.daysBack === daysBackOf(input.current, input.now)) return null;
  if (input.daysBack === 0 && !input.editing) return { at: null };
  return { at: shiftDays(input.now, input.daysBack) };
}

/** "Today", "Yesterday", "Thu 15", or "15 Oct" for a day further back than the chips reach. */
export function useSpentDayLabel(): (daysBack: number, now: Date) => string {
  const { t } = useLingui();
  const locale = useLocale();
  return (daysBack, now) => {
    if (daysBack === 0) return t({ id: 'money.add.today', message: 'Today' });
    if (daysBack === 1) return t({ id: 'money.add.yesterday', message: 'Yesterday' });
    const day = new Date(now.getTime() - daysBack * DAY_MS);
    return daysBack < DAY_CHIPS
      ? format.date(locale, day, { weekday: 'short', day: 'numeric' })
      : format.date(locale, day, { day: 'numeric', month: 'short' });
  };
}
