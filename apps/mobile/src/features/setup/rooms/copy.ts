/**
 * The rooms step's words: stay type names, the guide's grouping labels, the step's lines and the
 * room chips. Stored sentence case; the label and title variants uppercase them at render.
 */
import { t } from '@lingui/core/macro';

import type { TraitLabel } from './model';

export function stayName(type: string): string {
  switch (type) {
    case 'ryokan':
      return t({ id: 'setup.rooms.stay.ryokan', message: 'Ryokan' });
    case 'hotel':
      return t({ id: 'setup.rooms.stay.hotel', message: 'Hotel' });
    case 'apartment':
      return t({ id: 'setup.rooms.stay.apartment', message: 'Apartment' });
    case 'hostel':
      return t({ id: 'setup.rooms.stay.hostel', message: 'Hostel' });
    case 'villa':
      return t({ id: 'setup.rooms.stay.villa', message: 'Villa' });
    case 'guesthouse':
      return t({ id: 'setup.rooms.stay.guesthouse', message: 'Guesthouse' });
    default:
      return type.replace(/_/gu, ' ');
  }
}

export function traitName(trait: TraitLabel): string {
  switch (trait) {
    case 'light_sleepers':
      return t({ id: 'setup.rooms.trait.lightSleepers', message: 'Light sleepers' });
    case 'early_risers':
      return t({ id: 'setup.rooms.trait.earlyRisers', message: 'Early risers' });
    case 'night_owls':
      return t({ id: 'setup.rooms.trait.nightOwls', message: 'Night owls' });
    case 'couple':
      return t({ id: 'setup.rooms.trait.couple', message: 'Couple' });
  }
}

/** "the light sleepers", as the guide says it inside a sentence. */
function traitInSentence(trait: TraitLabel): string {
  switch (trait) {
    case 'light_sleepers':
      return t({ id: 'setup.rooms.traitIn.lightSleepers', message: 'the light sleepers' });
    case 'early_risers':
      return t({ id: 'setup.rooms.traitIn.earlyRisers', message: 'the early risers' });
    case 'night_owls':
      return t({ id: 'setup.rooms.traitIn.nightOwls', message: 'the night owls' });
    case 'couple':
      return t({ id: 'setup.rooms.traitIn.couple', message: 'the couple' });
  }
}

/** The organiser's line under the title: what the guide grouped, and how to change it. */
export function organiserLine(guide: string, traits: readonly TraitLabel[]): string {
  const [first, second] = traits;
  if (first !== undefined && second !== undefined) {
    const a = traitInSentence(first);
    const b = traitInSentence(second);
    return t({
      id: 'setup.rooms.line.two',
      message: `${guide} grouped ${a} and ${b}. Drag anyone to swap.`,
    });
  }
  if (first !== undefined) {
    const a = traitInSentence(first);
    return t({
      id: 'setup.rooms.line.one',
      message: `${guide} grouped ${a}. Drag anyone to swap.`,
    });
  }
  return t({
    id: 'setup.rooms.line.plain',
    message: `${guide} made the rooms. Drag anyone to swap.`,
  });
}

export function memberLine(organiser: string): string {
  return t({
    id: 'setup.rooms.line.member',
    message: `Here’s where you sleep. ${organiser} sets the rooms; ask if you’d like a swap.`,
  });
}

export type RoomChipKey = 'early_bird' | 'night_owl' | 'light_sleeper' | 'snorer' | 'dont_care';

export function chipName(chip: RoomChipKey): string {
  switch (chip) {
    case 'early_bird':
      return t({ id: 'setup.rooms.chip.earlyBird', message: 'Early bird' });
    case 'night_owl':
      return t({ id: 'setup.rooms.chip.nightOwl', message: 'Night owl' });
    case 'light_sleeper':
      return t({ id: 'setup.rooms.chip.lightSleeper', message: 'Light sleeper' });
    case 'snorer':
      return t({ id: 'setup.rooms.chip.snorer', message: 'I snore' });
    case 'dont_care':
      return t({ id: 'setup.rooms.chip.dontCare', message: 'Don’t care' });
  }
}
