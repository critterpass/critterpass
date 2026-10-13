/**
 * Pick {name}: which legs? in words, shared by both looks: each plan day with its window and hours
 * (or who has it), the overtime warning for a day longer than his price covers, his quote, what went
 * wrong with the last try, and which of set and ask the sheet offers.
 */
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';

import { dayLabel, hoursFigure } from '../shared/format';
import { pickErrorText, pickTermsLine } from './pick-card';
import type { PickDaysViewProps } from './PickDaysView';
import { usePickDays, type PickDaysProps } from './use-pick-days';

export function usePickDaysView(props: PickDaysProps): PickDaysViewProps {
  const locale = useLocale();
  const { t } = useLingui();
  const pick = usePickDays(props);
  const { long, name, includedHours } = pick;
  return {
    name,
    days: pick.days.map((day) => {
      const planDay = pick.plan.days.find((d) => d.date === day.date);
      const place = planDay?.gap?.place ?? planDay?.theme ?? '';
      const takenBy = pick.assignedOn.get(day.date)?.name ?? '';
      const window =
        day.window === null || day.hours === null
          ? ''
          : t({
              id: 'drivers.pick.window',
              message: `${day.window.start}–${day.window.end} · ${hoursFigure(day.hours, locale)} hours`,
            });
      return {
        date: day.date,
        title: `${dayLabel(day.date, locale)} · ${place}`,
        line: day.taken
          ? t({ id: 'drivers.pick.takenBy', message: `${takenBy} is booked` })
          : window,
        taken: day.taken,
        on: pick.picked.has(day.date) && !day.taken,
      };
    }),
    onToggle: pick.toggle,
    tell: {
      value: pick.tell && pick.phone != null,
      disabled: pick.phone == null,
      onChange: pick.setTell,
    },
    overtime:
      long === undefined || includedHours === null || long.hours === null
        ? null
        : t({
            id: 'drivers.pick.overtime',
            message: `${dayLabel(long.date, locale)} is ${hoursFigure(long.hours, locale)} hours. ${name}'s price covers ${hoursFigure(includedHours, locale)}.`,
          }),
    quote: pick.terms === null ? null : pickTermsLine(pick.terms, locale),
    error: pick.error === null ? null : pickErrorText(pick.error, locale),
    chosen: pick.chosen.length,
    busy: pick.busy,
    // A quote is agreed through the change set, which a trip of one applies at once.
    onSet: pick.terms === null ? pick.set : pick.solo ? pick.ask : null,
    onAsk: pick.solo ? null : pick.ask,
  };
}
