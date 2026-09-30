/**
 * Home's small formatters: a trip day ("Oct 12", from the trip's own calendar date so no zone can
 * shift it), relative times for the inbox's EARLIER list, guide tones and colours.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values and token names, never copy. */
import { t } from '@lingui/core/macro';

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

/**
 * "12m", "1h", "3d": the EARLIER list's compact age, from the catalogue rather than
 * `Intl.NumberFormat`'s unit style, which Hermes on iOS renders as seconds ("7,200 sec").
 */
export function shortAge(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
  if (minutes < 60) {
    const count = Math.max(1, minutes);
    return t({ id: 'home.age.minutes', message: `${count}m` });
  }
  if (minutes < 60 * 24) {
    const count = Math.round(minutes / 60);
    return t({ id: 'home.age.hours', message: `${count}h` });
  }
  const count = Math.round(minutes / (60 * 24));
  return t({ id: 'home.age.days', message: `${count}d` });
}

const GUIDE_TONES: Readonly<Record<GuideId, CardTone>> = {
  tokek: 'yellow',
  pon: 'orange',
  lundi: 'blue',
  ajo: 'pink',
  sardi: 'green',
  paco: 'cream',
  chava: 'red',
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
