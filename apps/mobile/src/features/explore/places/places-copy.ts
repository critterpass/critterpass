/** The places map's and list's words built from facts: chips, the label, card lines, counts. */
import { plural, t } from '@lingui/core/macro';

import { categoryLabel } from '../category';
import type { CategoryGroup, HubPlace } from './places-model';

export function groupLabel(group: CategoryGroup): string {
  switch (group) {
    case 'food':
      return t({ id: 'places.group.food', message: 'Food' });
    case 'temples':
      return t({ id: 'places.group.temples', message: 'Temples' });
    case 'nature':
      return t({ id: 'places.group.nature', message: 'Nature' });
    case 'beaches':
      return t({ id: 'places.group.beaches', message: 'Beaches' });
    case 'museums':
      return t({ id: 'places.group.museums', message: 'Museums' });
    case 'nightlife':
      return t({ id: 'places.group.nightlife', message: 'Nightlife' });
    case 'shopping':
      return t({ id: 'places.group.shopping', message: 'Shopping' });
    case 'wellness':
      return t({ id: 'places.group.wellness', message: 'Wellness' });
  }
}

/** "Alex + Rin", "Alex, Rin + 2". */
export function namesLine(names: readonly string[]): string {
  const [first, second] = names;
  if (first === undefined) return '';
  if (second === undefined) return first;
  if (names.length === 2) return t({ id: 'places.names.two', message: `${first} + ${second}` });
  const more = names.length - 2;
  return t({ id: 'places.names.more', message: `${first}, ${second} + ${more}` });
}

/** The label's second line: who saved it, which day it is on, or Tokek's pick. */
export function labelSubtitle(
  place: HubPlace,
  saverNames: readonly string[],
  guide: string,
): string {
  if (place.standing === 'plan' && place.dayNo !== null) {
    const day = place.dayNo;
    return t({ id: 'places.label.inPlan', message: `In the plan · day ${day}` });
  }
  if (place.standing === 'saved') {
    const who = namesLine(saverNames);
    return who === ''
      ? t({ id: 'places.label.saved', message: 'Saved' })
      : t({ id: 'places.label.savedBy', message: `Saved by ${who}` });
  }
  return t({ id: 'places.label.suggested', message: `${guide} suggests it` });
}

/** "Water temple · 45 min from the villa"; the category alone without a stay. */
export function cardDescription(
  category: string,
  minutesFromStay: number | null,
  stayName: string | null,
): string {
  const kind = categoryLabel(category);
  if (minutesFromStay === null || stayName === null) return kind;
  const minutes = minutesFromStay;
  return t({ id: 'places.card.fromStay', message: `${kind} · ${minutes} min from ${stayName}` });
}

/** "Tombs cut into a ravine · 10 min on" for the cards after the first. */
export function cardDescriptionOn(category: string, minutesOn: number): string {
  const kind = categoryLabel(category);
  const minutes = minutesOn;
  return t({ id: 'places.card.minutesOn', message: `${kind} · ${minutes} min on` });
}

/** The + button's words for a screen reader. */
export function addLabel(name: string): string {
  return t({ id: 'places.add', message: `Add ${name} to the plan` });
}

export function nextDoorLabel(): string {
  return t({ id: 'places.card.nextDoor', message: 'Next door' });
}

/** "1 of 9 in view · nearest first". */
export function carouselCount(position: number, count: number): string {
  return t({
    id: 'places.carousel.count',
    message: `${position} of ${count} in view · nearest first`,
  });
}

/** "86 places in view". */
export function inViewCount(count: number): string {
  return t({
    id: 'places.inView',
    message: plural(count, { one: '# place in view', other: '# places in view' }),
  });
}
