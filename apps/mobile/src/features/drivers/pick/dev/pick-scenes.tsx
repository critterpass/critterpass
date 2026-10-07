/**
 * Lab scenes for the pick sheet (6d-2) over the render's Bali days, one already taken: a crew trip
 * (SET and the "Ask the crew first" toggle), a trip of one (SET only), a pick on the driver's quote (the crew
 * is asked first), and each way a pick is refused.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import type { PickError } from '../crew-pick';
import { pickErrorText, pickTermsLine } from '../pick-card';
import { PickDaysView, type PickDayRow } from '../PickDaysView';

const noop = () => undefined;

const DAYS: readonly PickDayRow[] = [
  {
    date: '2026-10-14',
    title: 'Wed 14 · Jatiluwih',
    line: '06:30–18:00 · 11½ hours',
    taken: false,
    on: true,
  },
  {
    date: '2026-10-18',
    title: 'Sun 18 · Uluwatu',
    line: '13:00–21:30 · 8½ hours',
    taken: false,
    on: true,
  },
  {
    date: '2026-10-16',
    title: 'Fri 16 · Sanur harbour',
    line: '07:00–08:00 · 1 hour',
    taken: false,
    on: false,
  },
  { date: '2026-10-15', title: 'Thu 15 · Batur', line: 'Ketut is booked', taken: true, on: false },
];

function PickScene({
  solo = false,
  quote = false,
  error = null,
}: {
  solo?: boolean;
  quote?: boolean;
  error?: PickError | null;
}) {
  const locale = useLocale();
  return (
    <PickDaysView
      name="Made"
      days={DAYS}
      onToggle={noop}
      tell={{ value: true, disabled: false, onChange: noop }}
      quote={
        quote
          ? pickTermsLine(
              { price_minor: 80_000_000, currency: 'IDR', price_unit: 'day', included_hours: 10 },
              locale,
            )
          : null
      }
      overtime={quote || error !== null ? null : 'Wed is 11½ hours. Made’s price covers 10.'}
      error={error === null ? null : pickErrorText(error, locale)}
      chosen={2}
      busy={null}
      onSet={quote && !solo ? null : noop}
      onAsk={solo ? null : noop}
    />
  );
}

export const PICK_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'pick-crew': () => <PickScene />,
  'pick-solo': () => <PickScene solo />,
  'pick-quote': () => <PickScene quote />,
  'pick-day-taken': () => <PickScene error={{ kind: 'day_taken', dates: ['2026-10-15'] }} />,
  'pick-driver-gone': () => <PickScene error={{ kind: 'driver_gone' }} />,
  'pick-day-twice': () => <PickScene error={{ kind: 'days' }} />,
};

export const PICK_SCENE_NAMES: readonly string[] = Object.keys(PICK_SCENES);
