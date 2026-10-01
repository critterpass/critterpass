/** Server-side helpers that render the coming-soon page's copy in one language. */
import { comingSoonCopy as copy } from '../components/site/copy/coming-soon';
import {
  comingSoonSectionsCopy as sections,
  hatchLocalCopy,
} from '../components/site/copy/coming-soon-sections';
import type { Translate } from '../components/site/i18n';
import type { PageStrings } from '../scripts/page-strings';

/** Locals to collect, as the page's design states it. */
export const LOCALS_TOTAL = 150;

/** A placeholder left in place for the browser to fill (`fill` in src/scripts/page-strings.ts). */
function keep(...names: string[]): Record<string, string> {
  return Object.fromEntries(names.map((name) => [name, `{${name}}`]));
}

export function formatNumber(locale: string, value: number): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * A translated sentence cut around one placeholder, so the page can put a live element (a count
 * the scripts keep fresh) wherever that language places it: `['', ' IN LINE']` in English.
 */
export function aroundSlot(
  t: Translate,
  descriptor: Parameters<Translate>[0],
  name: string,
): readonly [string, string] {
  const token = `{${name}}`;
  const text = t(descriptor, { [name]: token });
  const at = text.indexOf(token);
  if (at === -1) return [text, ''];
  return [text.slice(0, at), text.slice(at + token.length)];
}

export function pageStrings(t: Translate, locale: string): PageStrings {
  return {
    typedLine: t(copy.typedLine),
    note: t(copy.note),
    emailInvalid: t(copy.emailInvalid),
    rateLimited: t(copy.rateLimited),
    joinFailed: t(copy.joinFailed),
    ticketWaitlist: t(copy.ticketWaitlist),
    ticketConfirmed: t(copy.ticketConfirmed),
    navJoin: t(copy.joinWaitlist),
    navJoined: t(copy.youAre, keep('position')),
    finalJoin: t(sections.saveSeatUp),
    finalShare: t(sections.finalShare),
    savingSeat: t(copy.savingSeat, keep('name', 'place')),
    shareTitle: t(copy.shareTitle),
    shareText: t(copy.shareText, keep('url')),
    copied: t(copy.copied),
    countdown: t(copy.countdown, keep('days', 'hours', 'minutes', 'seconds')),
    boardingNow: t(copy.boardingNow),
    eggHints: [t(sections.hintTap), t(sections.hintCrack), t(sections.hintCrackLoud)],
    hatchedNumber: t(sections.hatchedNumber, {
      ...keep('num', 'city'),
      total: formatNumber(locale, LOCALS_TOTAL),
    }),
    hatchLines: Object.fromEntries(
      Object.entries(hatchLocalCopy).map(([id, descriptor]) => [id, t(descriptor)]),
    ),
  };
}
