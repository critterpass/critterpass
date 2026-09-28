/**
 * Home's small formatters: a trip day ("Oct 12", from the trip's own calendar date so no zone can
 * shift it), relative times for the inbox's EARLIER list, guide tones and colours.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values and token names, never copy. */
import { tokens } from '@cp/design-tokens';
import { format } from '@cp/i18n';

import type { CardTone } from '@/ui/cards/tone';
import type { GuideId } from '@/ui/people/GuideLine';

/** "Oct 12" for a `YYYY-MM-DD` calendar date, in the reader's language. */
export function tripDay(locale: string, date: string): string {
  return format.date(locale, new Date(`${date}T12:00:00Z`), {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "12m", "1h", "3d": the EARLIER list's compact age. */
export function shortAge(locale: string, at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  const unit =
    minutes < 60
      ? { value: Math.max(1, minutes), unit: 'minute' as const }
      : minutes < 60 * 24
        ? { value: Math.round(minutes / 60), unit: 'hour' as const }
        : { value: Math.round(minutes / (60 * 24)), unit: 'day' as const };
  return format.number(locale, unit.value, {
    style: 'unit',
    unit: unit.unit,
    unitDisplay: 'narrow',
  });
}

const GUIDE_TONES: Readonly<Record<GuideId, CardTone>> = {
  tokek: 'yellow',
  pon: 'orange',
  lundi: 'blue',
  ajo: 'pink',
  sardi: 'green',
  paco: 'cream',
};

export function isGuideId(value: string | null | undefined): value is GuideId {
  return value !== null && value !== undefined && value in GUIDE_TONES;
}

export function guideOr(value: string | null | undefined, fallback: GuideId = 'tokek'): GuideId {
  return isGuideId(value) ? value : fallback;
}

export function guideTone(guide: GuideId): CardTone {
  return GUIDE_TONES[guide];
}

export function guideColour(guide: GuideId): string {
  return tokens.guide[guide];
}
