import { t } from '@lingui/core/macro';

import { useLocale } from '@/lib/i18n/use-locale';

import { SecondaryText } from '../cards/SecondaryText';

export interface StaleCaptionProps {
  readonly updatedAt: Date;
  /** Injected for tests and for a shared ticking clock. @default new Date() */
  readonly now?: Date;
  readonly testID?: string;
}

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "3 hours ago" in the UI locale; "now" under a minute. */
export function relativeAge(updatedAt: Date, now: Date, locale: string): string {
  const elapsed = updatedAt.getTime() - now.getTime();
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) return format.format(Math.round(elapsed / ms), unit);
  }
  return format.format(0, 'minute');
}

/** "Updated 3 hours ago" under data older than its freshness threshold (and on every forecast/price). */
export function StaleCaption({ updatedAt, now = new Date(), testID }: StaleCaptionProps) {
  const locale = useLocale();
  const age = relativeAge(updatedAt, now, locale);
  return (
    <SecondaryText variant="caption" testID={testID}>
      {t({ id: 'common.stale.updated', message: `Updated ${age}` })}
    </SecondaryText>
  );
}
