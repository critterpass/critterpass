/**
 * The recap story's words: the header, each card's eyebrow and headline, and the narration a card
 * shows (the guide's own, in the reader's language, or a line built from the card's numbers while
 * the guide has not written it). Numbers come from the recap row and are only formatted here.
 */
import type { RecapCard } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';

import { format } from '@cp/i18n';

import type { GuideId } from '@/ui/people/GuideLine';

import { wholeMoney } from '../summary/summary-copy';
import type { SummaryModel } from '../summary/summary-model';

// eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time suffix, never copy.
const NOON_UTC = 'T12:00:00Z';

/** "Oct 2–4", the trip's dates on its own clock. */
export function tripDates(summary: SummaryModel, locale: string): string {
  if (summary.startDate === null || summary.endDate === null) return '';
  return format.dateInterval(
    locale,
    new Date(`${summary.startDate}${NOON_UTC}`),
    new Date(`${summary.endDate}${NOON_UTC}`),
    { month: 'short', day: 'numeric', timeZone: 'UTC' },
  );
}

/** Each guide's theme as the header names it ("♪ gamelan lo-fi"). */
export function themeName(guide: GuideId): string {
  switch (guide) {
    case 'tokek':
      return t({ id: 'recap.story.theme.tokek', message: 'gamelan lo-fi' });
    case 'pon':
      return t({ id: 'recap.story.theme.pon', message: 'koto and rain' });
    case 'lundi':
      return t({ id: 'recap.story.theme.lundi', message: 'slow sea shanty' });
    case 'ajo':
      return t({ id: 'recap.story.theme.ajo', message: 'marimba lo-fi' });
    case 'sardi':
      return t({ id: 'recap.story.theme.sardi', message: 'fado guitar waltz' });
    case 'paco':
      return t({ id: 'recap.story.theme.paco', message: 'pan flute and charango' });
    case 'chava':
    default:
      return t({ id: 'recap.story.theme.chava', message: 'đàn bầu lo-fi' });
  }
}

export function presents(guideName: string): string {
  return t({ id: 'recap.story.presents', message: `${guideName} presents` });
}

/** "Đà Nẵng, the recap · ♪ đàn bầu lo-fi"; without the theme when it does not play. */
export function storySubtitle(place: string | null, theme: string | null): string {
  const title =
    place === null
      ? t({ id: 'recap.story.subtitleNoPlace', message: 'The recap' })
      : t({ id: 'recap.story.subtitle', message: `${place}, the recap` });
  return theme === null ? title : `${title} · ♪ ${theme}`;
}

export function storyHint(): string {
  return t({ id: 'recap.story.hint', message: 'Tap to start · hold to pause' });
}

/** What each card is, for screen readers and the progress announcement. */
export function cardLabel(card: RecapCard): string {
  switch (card) {
    case 'cover':
      return t({ id: 'recap.story.label.cover', message: 'The cover' });
    case 'critters':
      return t({ id: 'recap.story.label.critters', message: 'New locals' });
    case 'route':
      return t({ id: 'recap.story.label.route', message: 'The route' });
    case 'awards':
      return t({ id: 'recap.story.label.awards', message: 'The crew awards' });
    case 'receipt':
      return t({ id: 'recap.story.label.receipt', message: 'The receipt' });
    case 'got_away':
      return t({ id: 'recap.story.label.gotAway', message: 'The one that got away' });
    case 'stamp':
      return t({ id: 'recap.story.label.stamp', message: 'The stamp' });
    case 'postcard':
    default:
      return t({ id: 'recap.story.label.postcard', message: 'The postcard' });
  }
}

export function daysChip(days: number): string {
  return t({
    id: 'recap.story.cover.days',
    message: plural(days, { one: '# day', other: '# days' }),
  });
}

export function travellersChip(travellers: number): string {
  return travellers === 1
    ? t({ id: 'recap.story.cover.solo', message: 'Just you' })
    : t({
        id: 'recap.story.cover.travellers',
        message: plural(travellers, { one: '# of you', other: '# of you' }),
      });
}

export function sunriseChip(count: number): string {
  return t({
    id: 'recap.story.cover.sunrise',
    message: plural(count, { one: '# sunrise start', other: '# sunrise starts' }),
  });
}

export function newLocalsTitle(count: number): string {
  return t({
    id: 'recap.story.critters.title',
    message: plural(count, { 0: 'Old friends only', one: '# new local', other: '# new locals' }),
  });
}

export function formsFoundLine(forms: number): string {
  return t({
    id: 'recap.story.critters.line',
    message: plural(forms, {
      one: 'One form found on the trip.',
      other: '# forms found on the trip.',
    }),
  });
}

export function routeDriverLine(name: string, km: number): string {
  return t({ id: 'recap.story.route.driver', message: `${name} drove ${km} of them.` });
}

export function routeStopsLine(stops: number): string {
  return t({
    id: 'recap.story.route.stops',
    message: plural(stops, { one: 'One stop on the trail.', other: '# stops on the trail.' }),
  });
}

/** "Longest leg: Hội An to Sơn Trà, 45 min." while the guide has not written it. */
export function longestLegLine(from: string, to: string, minutes: number): string {
  return t({
    id: 'recap.story.route.longest',
    message: `Longest leg: ${from} to ${to}, ${minutes} min.`,
  });
}

/** "Day 2", "Days 2–4", with a start time when the stop had one. */
export function stopDays(from: number, to: number, time: string | null): string {
  const days =
    from === to
      ? t({ id: 'recap.story.route.day', message: `Day ${from}` })
      : t({ id: 'recap.story.route.days', message: `Days ${from}–${to}` });
  return time === null ? days : `${days} · ${time}`;
}

export function awardsTitle(count: number): string {
  return t({
    id: 'recap.story.awards.title',
    message: plural(count, {
      one: 'Just you, one award',
      other: '# of you, # awards',
    }),
  });
}

export function receiptHeadline(
  locale: string,
  underMinor: number | null,
  totalMinor: number,
  currency: string,
): string {
  if (underMinor !== null && underMinor > 0) {
    const amount = wholeMoney(locale, underMinor, currency);
    return t({ id: 'recap.story.receipt.under', message: `${amount} under` });
  }
  if (underMinor !== null && underMinor < 0) {
    const amount = wholeMoney(locale, -underMinor, currency);
    return t({ id: 'recap.story.receipt.over', message: `${amount} over` });
  }
  const amount = wholeMoney(locale, totalMinor, currency);
  return t({ id: 'recap.story.receipt.total', message: `${amount} all in` });
}

export function stampCaption(seq: number | null, place: string): string {
  return seq === null
    ? t({ id: 'recap.story.stamp.captionNoSeq', message: `${place} is stamped` })
    : t({ id: 'recap.story.stamp.caption', message: `Stamp ${seq} is ${place}` });
}

/** "Seen twice on the trip, befriended by nobody." while the guide has not written the line. */
export function seenLine(sightings: number): string {
  return t({
    id: 'recap.story.gotAway.seen',
    message: plural(sightings, {
      0: 'Out there all trip, befriended by nobody.',
      one: 'Seen once, befriended by nobody.',
      other: 'Seen # times, befriended by nobody.',
    }),
  });
}
