/**
 * The guide's note at the foot of a destination page when its notes can't show: the place has no
 * guide yet, the guide is still writing it up, the phone is offline, or the read failed online.
 */
import { t } from '@lingui/core/macro';

import type { DestinationViewProps } from '../../screens/destination-view-props';

export function destinationNoticeText(
  notice: NonNullable<DestinationViewProps['notice']>,
  guide: { readonly name: string },
  hero: { readonly name: string },
): string {
  switch (notice) {
    case 'writing':
      return t({
        id: 'explore.dest.writing',
        message: `${guide.name} is still writing up ${hero.name}: the month-by-month crowds land here. The places are already on the map.`,
      });
    case 'offline':
      return t({
        id: 'explore.dest.unavailable',
        message: `${guide.name}’s notes on ${hero.name} didn’t load. They’ll show up once this phone is back online.`,
      });
    case 'unavailable':
      return t({
        id: 'explore.dest.failed',
        message: `${guide.name}’s notes on ${hero.name} didn’t come through this time. Open the page again in a little while.`,
      });
    case 'limited':
      return t({
        id: 'explore.limited.body',
        message: `No guide lives in ${hero.name} yet, so the month-by-month crowds aren’t written. Flights, money and the best months are covered, and ${guide.name} plans the trip all the same.`,
      });
  }
}
