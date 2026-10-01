/** Legendary calendar words (3l-9) and the co-presence card, in the active locale. */
import { format } from '@cp/i18n';
import { plural, t } from '@lingui/core/macro';

export function title(): string {
  return t({ id: 'critters.legendary.title', message: 'Once a year' });
}

export function intro(): string {
  return t({
    id: 'critters.legendary.intro',
    message:
      "Legendaries only show up on one day a year, or for the hardest thing a place has. They can't be bought or traded.",
  });
}

export function remindMe(): string {
  return t({ id: 'critters.legendary.remindMe', message: 'Remind me' });
}

export function remindersOn(): string {
  return t({ id: 'critters.legendary.remindersOn', message: 'Reminders on' });
}

export function onOneDay(): string {
  return t({ id: 'critters.legendary.onOneDay', message: 'On one day' });
}

export function hardest(): string {
  return t({ id: 'critters.legendary.hardest', message: 'For the hardest thing' });
}

export function yourDates(): string {
  return t({ id: 'critters.legendary.yourDates', message: 'Your dates' });
}

export function found(): string {
  return t({ id: 'critters.legendary.found', message: 'Found' });
}

export function reminding(): string {
  return t({ id: 'critters.legendary.reminding', message: 'Reminder set' });
}

export function monthShort(month: number, locale: string): string {
  return format.date(locale, new Date(Date.UTC(2026, month - 1, 15)), {
    month: 'short',
    timeZone: 'UTC',
  });
}

export function monthNarrow(month: number, locale: string): string {
  return format.date(locale, new Date(Date.UTC(2026, month - 1, 15)), {
    month: 'narrow',
    timeZone: 'UTC',
  });
}

export function monthLong(month: number, locale: string): string {
  return format.date(locale, new Date(Date.UTC(2026, month - 1, 15)), {
    month: 'long',
    timeZone: 'UTC',
  });
}

export function part(p: 'early' | 'mid' | 'late'): string {
  switch (p) {
    case 'early':
      return t({ id: 'critters.legendary.early', message: 'Early' });
    case 'mid':
      return t({ id: 'critters.legendary.mid', message: 'Mid' });
    case 'late':
      return t({ id: 'critters.legendary.late', message: 'Late' });
  }
}

export function anyLabel(): { top: string; bottom: string } {
  return {
    top: t({ id: 'critters.legendary.any', message: 'Any' }),
    bottom: t({ id: 'critters.legendary.day', message: 'Day' }),
  };
}

export function hereCount(here: number, needed: number): string {
  return t({ id: 'critters.legendary.hereCount', message: `${here} of ${needed} in` });
}

export function missingLine(names: string): string {
  return t({ id: 'critters.legendary.missing', message: `Still to come: ${names}` });
}

export function everyoneHere(): string {
  return t({ id: 'critters.legendary.everyone', message: 'Everyone is here. Hold on together.' });
}

export function remindersSet(count: number): string {
  return t({
    id: 'critters.legendary.remindersSet',
    message: plural(count, {
      one: "We'll nudge you a month before # window",
      other: "We'll nudge you a month before # windows",
    }),
  });
}

export function inboxOnly(): string {
  return t({
    id: 'critters.legendary.inboxOnly',
    message: 'Notifications are off, so reminders will wait in your inbox.',
  });
}

export function emptyTitle(): string {
  return t({ id: 'critters.legendary.emptyTitle', message: 'No legendaries yet' });
}

export function emptyBody(): string {
  return t({
    id: 'critters.legendary.emptyBody',
    message: 'They arrive with the places they live in. Check back after your next update.',
  });
}

export function copresenceDone(): string {
  return t({
    id: 'critters.legendary.copresenceDone',
    message: 'The whole crew was there. It’s on everyone’s pass.',
  });
}
