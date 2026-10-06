/**
 * The memory's words (3m-10): "{PLACE}, A YEAR ON", the day it looks back on with the moment it
 * calls back, and the reaction chips' labels. Numbers and names come from the recap's stats.
 */
import { format } from '@cp/i18n';
import { t } from '@lingui/core/macro';

import { memberFirstName } from '@/ui/people/member-name';

import type { MemoryMoment, MemoryReactionChip } from './memory-model';

// eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time suffix, never copy.
const NOON_UTC = 'T12:00:00Z';

export function memoryTitle(place: string | null): string {
  return place === null
    ? t({ id: 'recap.memory.titleNoPlace', message: 'A year on' })
    : t({ id: 'recap.memory.title', message: `${place}, a year on` });
}

function momentLine(moment: MemoryMoment): string {
  switch (moment.kind) {
    case 'sunrise': {
      const { time, name } = moment;
      return t({ id: 'recap.memory.line.sunrise', message: `Up and out at ${time} for ${name}.` });
    }
    case 'best_day': {
      const { dayNo, days } = moment;
      return t({
        id: 'recap.memory.line.bestDay',
        message: `Day ${dayNo} of ${days}. The day you all still talk about.`,
      });
    }
    case 'trip': {
      const { days, travellers } = moment;
      return travellers > 1
        ? t({ id: 'recap.memory.line.crew', message: `${days} days, ${travellers} of you.` })
        : t({ id: 'recap.memory.line.solo', message: `${days} days, just you.` });
    }
    case 'written':
      return moment.text;
  }
}

/** "Oct 15, 2026. Up and out at 06:02 for Mount Batur." */
export function memoryBody(locale: string, localDate: string | null, moment: MemoryMoment): string {
  const line = momentLine(moment);
  if (localDate === null || moment.kind === 'written') return line;
  const day = format.date(locale, new Date(`${localDate}${NOON_UTC}`), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `${day}. ${line}`;
}

/** The chip's words after the avatar: "❤ 2", "“again??”". */
export function reactionLabel(chip: MemoryReactionChip): string {
  if (chip.text !== null) return `“${chip.text}”`;
  return chip.count > 1 ? `${chip.emoji ?? ''} ${chip.count}` : (chip.emoji ?? '');
}

/** What a screen reader says for the chip. */
export function reactionA11y(chip: MemoryReactionChip): string {
  const name = chip.mine
    ? t({ id: 'recap.memory.you', message: 'You' })
    : memberFirstName(chip.name);
  const label = reactionLabel(chip);
  return chip.count > 1
    ? t({ id: 'recap.memory.reactedMany', message: `${name} and others: ${label}` })
    : `${name}: ${label}`;
}
