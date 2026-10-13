import { useLingui } from '@lingui/react/macro';

import type { DistanceUnit, TimeFormat } from '@/lib/i18n/formats';

/** The words for each time and distance format. */
export function useFormatWords() {
  const { t } = useLingui();
  return {
    time: (value: TimeFormat) =>
      value === '12h'
        ? t({ id: 'you.formats.twelveHour', message: '12-hour' })
        : t({ id: 'you.formats.twentyFourHour', message: '24-hour' }),
    distance: (value: DistanceUnit) =>
      value === 'mi'
        ? t({ id: 'you.formats.mi', message: 'mi' })
        : t({ id: 'you.formats.km', message: 'km' }),
  };
}
