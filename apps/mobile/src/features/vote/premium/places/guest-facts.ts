/** The guest page's quick facts under the place's name: how far from home, the best months, money. */
import { useLingui } from '@lingui/react/macro';

import { monthShort } from '../../format';
import type { GuestPlace } from '../../places/use-guest-brief';
import { fxLine } from '../../places/city-guide';

export interface GuestFact {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export function useGuestFacts(place: GuestPlace | null): readonly GuestFact[] {
  const { t, i18n } = useLingui();
  const facts: GuestFact[] = [];
  if (place?.stops != null) {
    facts.push({
      key: 'home',
      label: t({ id: 'vote.premium.guest.fromHome', message: 'From home' }),
      value:
        place.stops === 0
          ? t({ id: 'vote.premium.guest.direct', message: 'Direct' })
          : place.stops === 1
            ? t({ id: 'vote.premium.guest.oneStop', message: '1 stop' })
            : t({ id: 'vote.premium.guest.stops', message: `${place.stops} stops` }),
    });
  }
  if (place !== null && place.bestMonths.length > 0) {
    const first = place.bestMonths[0] ?? 1;
    const last = place.bestMonths[place.bestMonths.length - 1] ?? first;
    facts.push({
      key: 'best',
      label: t({ id: 'vote.premium.guest.best', message: 'Best' }),
      value:
        first === last
          ? monthShort(i18n.locale, first)
          : `${monthShort(i18n.locale, first)}–${monthShort(i18n.locale, last)}`,
    });
  }
  const fx = place?.fx == null ? null : fxLine(i18n.locale, place.fx);
  if (fx !== null) {
    facts.push({
      key: 'fx',
      label: t({ id: 'vote.premium.guest.money', message: 'Money' }),
      value: fx,
    });
  }
  return facts;
}
