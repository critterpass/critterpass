/**
 * Pick {name}: which legs? (6d-2), a sheet over the comparison. SET writes him onto the days at
 * once; on a crew trip "Ask the crew first" puts the same pick to the crew as a vote (a change
 * set that sets him on the days when it passes). "Tell {name} on WhatsApp" opens the days and
 * pickup pins in the traveller's WhatsApp after SET. A day longer than the hours his price covers
 * shows the overtime warning; a refused pick says why. Opened from a driver's reply, the pick
 * carries his quote as the terms the crew votes on.
 */
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';

import { dayLabel, hoursFigure } from '../shared/format';
import { pickErrorText, pickTermsLine } from './pick-card';
import { PickDaysView } from './PickDaysView';
import { usePickDays, type PickDaysProps } from './use-pick-days';

export function PickDaysSheet(props: PickDaysProps) {
  const locale = useLocale();
  const { t } = useLingui();
  const pick = usePickDays(props);
  const { long, name, includedHours } = pick;
  return (
    <PickDaysView
      name={pick.name}
      days={pick.days.map((day) => {
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
      })}
      onToggle={pick.toggle}
      tell={{
        value: pick.tell && pick.phone != null,
        disabled: pick.phone == null,
        onChange: pick.setTell,
      }}
      overtime={
        long === undefined || includedHours === null || long.hours === null
          ? null
          : t({
              id: 'drivers.pick.overtime',
              message: `${dayLabel(long.date, locale)} is ${hoursFigure(long.hours, locale)} hours. ${name}'s price covers ${hoursFigure(includedHours, locale)}.`,
            })
      }
      quote={pick.terms === null ? null : pickTermsLine(pick.terms, locale)}
      error={pick.error === null ? null : pickErrorText(pick.error, locale)}
      chosen={pick.chosen.length}
      busy={pick.busy}
      // A quote is agreed through the change set, which a trip of one applies at once.
      onSet={pick.terms === null ? pick.set : pick.solo ? pick.ask : null}
      onAsk={pick.solo ? null : pick.ask}
    />
  );
}
