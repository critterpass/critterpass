/** The right-hand line of a closed card: "Oct 15 · 03:30", "5 nights", or the day alone. */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';

import { nightsOf, type WalletBooking } from '../data/model';
import { clock, shortDate } from '../format';

export function useDeckMeta(): (booking: WalletBooking, tz?: string) => string {
  const { t } = useLingui();
  const locale = useLocale();
  return (booking, tz) => {
    if (booking.kind === 'stay') {
      const nights = nightsOf(booking);
      if (nights !== null) {
        return t({
          id: 'bookings.card.nights',
          message: plural(nights, { one: '# night', other: '# nights' }),
        });
      }
    }
    const start = booking.segments[0]?.sched_dep_at ?? booking.startsAt;
    return [shortDate(locale, start, tz), clock(locale, start, tz)]
      .filter((part) => part !== '')
      .join(' · ');
  };
}
