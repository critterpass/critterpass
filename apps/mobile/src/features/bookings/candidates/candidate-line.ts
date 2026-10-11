/**
 * A found booking's one line for either UI: "Fri Oct 16 · 07:05 → 08:30 · Sanur · 6 seats · paid
 * by you · $228".
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';

import { displayWithHome, useMoneyDisplay } from '@/data/money';
import { useLocale } from '@/lib/i18n/use-locale';

import { clock, dayDate, price as formatPrice, zoneOf } from '../format';
import type { CandidateView } from './candidate-model';

export function useCandidateLine(view: CandidateView, tz: string | undefined): string {
  const locale = useLocale();
  useMoneyDisplay();
  const { t } = useLingui();
  const booking = view.booking;
  if (booking === null) return '';
  const zone = zoneOf(booking.tz, tz);
  const start = booking.segments[0]?.sched_dep_at ?? booking.starts_at;
  // A flight reads "07:05 → 08:30" when the confirmation printed when it lands.
  const lands = booking.segments[booking.segments.length - 1]?.sched_arr_at;
  const leaves = clock(locale, start, zone);
  const seats = view.travellerIds.length;
  return [
    dayDate(locale, start, zone),
    booking.kind === 'stay'
      ? ''
      : lands === undefined || leaves === ''
        ? leaves
        : `${leaves} → ${clock(locale, lands, zone)}`,
    booking.location ?? '',
    seats >= 2
      ? t({
          id: 'bookings.candidate.seats',
          message: plural(seats, { one: '# seat', other: '# seats' }),
        })
      : '',
    view.mine && booking.price !== null
      ? t({ id: 'bookings.candidate.paidByYou', message: 'paid by you' })
      : '',
    booking.price === null
      ? ''
      : displayWithHome(
          formatPrice(locale, booking.price.amount_minor, booking.price.currency),
          booking.price.amount_minor,
          booking.price.currency,
          locale,
        ),
  ]
    .filter((part) => part !== '')
    .join(' · ');
}
