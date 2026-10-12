/** How far the nearest facility is, in the words both Help pages use. */
import type { useLingui } from '@lingui/react/macro';

import { distanceIn } from '@/lib/i18n/formats';

import type { HubFacility } from './help-model';

export function facilityDetail(
  facility: HubFacility,
  t: ReturnType<typeof useLingui>['t'],
): string {
  if (facility.minutes !== null) {
    const minutes = facility.minutes;
    return t({ id: 'safety.help.byCar', message: `${minutes} min by car` });
  }
  if (facility.distanceM !== null) {
    const away = distanceIn(facility.distanceM);
    const n = away.value.toFixed(1);
    return away.unit === 'mi'
      ? t({ id: 'safety.help.awayMiles', message: `${n} mi away` })
      : t({ id: 'safety.help.away', message: `${n} km away` });
  }
  return facility.phone ?? '';
}
