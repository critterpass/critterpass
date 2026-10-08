/**
 * Critter words shared by several screens, in the active locale. A critter's name is never built
 * here: names come only from the viewer's own verified finds.
 */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { clockOption } from '@/lib/i18n/formats';

/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */

export function crewFindToast(member: string, first: boolean): string {
  return first
    ? t({ id: 'critters.crew.firstSpotter', message: `${member} spotted a new critter first` })
    : t({ id: 'critters.crew.befriended', message: `${member} befriended a critter` });
}

/** "???" in place of a name the viewer hasn't earned yet. */
export function unknownName(): string {
  return t({ id: 'critters.unknownName', message: '???' });
}

/** The back control of a page reached from more than one place (a set, a critter, the dex). */
export function backLabel(): string {
  return t({ id: 'critters.back', message: 'Back' });
}

export function loadingCritter(): string {
  return t({ id: 'critters.loading', message: 'Loading the critter' });
}

/** A hand-off to the maps app that did not open. */
export function mapsFailed(): string {
  return t({ id: 'critters.mapsFailed', message: 'Couldn’t open your maps app' });
}

/** "Oct 14, 10:42" in the viewer's locale. */
export function foundAt(iso: string, locale: string): string {
  return format.date(locale, new Date(iso), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    ...clockOption(),
    minute: '2-digit',
  });
}

/**
 * "Apr 2–9" or "Mar 30 – Apr 4" for a window span, in the viewer's locale. Built from two dates
 * rather than `formatRange`, which Hermes's Intl doesn't have.
 */
export function spanLabel(start: string, end: string, locale: string): string {
  const monthDay = { month: 'short', day: 'numeric', timeZone: 'UTC' } as const;
  const a = new Date(`${start}T12:00:00Z`);
  const b = new Date(`${end}T12:00:00Z`);
  if (start === end) return format.date(locale, a, monthDay);
  if (start.slice(0, 7) === end.slice(0, 7)) {
    const day = format.date(locale, b, { day: 'numeric', timeZone: 'UTC' });
    return `${format.date(locale, a, monthDay)}–${day}`;
  }
  return `${format.date(locale, a, monthDay)} – ${format.date(locale, b, monthDay)}`;
}
