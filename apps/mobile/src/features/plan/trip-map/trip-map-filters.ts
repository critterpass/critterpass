/**
 * The chips across the top of the trip map (7a-1) and the open day map (7b-2): the chosen day
 * (by its date, in its colour; tapping it again shows every day at equal strength), SAVED with
 * the count, CREW PICKS and the commonest categories. A filter chip fades what it leaves out to
 * 20 %; tapping the lit chip clears it. A chip with nothing behind it (nothing saved, no place two
 * of the crew back) is left out rather than shown doing nothing.
 */
/* eslint-disable lingui/no-unlocalized-strings -- chip keys, never copy. */
import { t } from '@lingui/core/macro';

import type { PlanningChip } from '@/ui/planning';

import { NO_FILTER, type MapFilter } from './map-places';
import type { TripDay } from './trip-days';

export const DAY_CHIP = 'day';
const CATEGORY_PREFIX = 'cat:';

export function categoryChipLabel(category: string): string {
  switch (category) {
    case 'temple_shrine':
      return t({ id: 'plan.tripMap.cat.temples', message: 'Temples' });
    case 'food':
      return t({ id: 'plan.tripMap.cat.food', message: 'Food' });
    case 'market':
      return t({ id: 'plan.tripMap.cat.markets', message: 'Markets' });
    case 'nature':
      return t({ id: 'plan.tripMap.cat.nature', message: 'Nature' });
    case 'beach':
      return t({ id: 'plan.tripMap.cat.beaches', message: 'Beaches' });
    case 'museum':
      return t({ id: 'plan.tripMap.cat.museums', message: 'Museums' });
    case 'nightlife':
      return t({ id: 'plan.tripMap.cat.nightlife', message: 'Nightlife' });
    case 'shopping':
      return t({ id: 'plan.tripMap.cat.shopping', message: 'Shopping' });
    case 'health':
      return t({ id: 'plan.tripMap.cat.wellness', message: 'Wellness' });
    default:
      return t({ id: 'plan.tripMap.cat.places', message: 'Places' });
  }
}

export interface ChipInput {
  readonly day: TripDay | null;
  readonly dayChosen: boolean;
  /** The day by its date ("Sat, 10/17"); empty while it has none. */
  readonly weekday: string;
  readonly saved: number;
  /** Saved places two or more of the crew back; absent keeps the chip (a lab scene). */
  readonly crewPicks?: number | undefined;
  readonly categories: readonly string[];
  readonly filter: MapFilter;
  /** The guide's picks chip (7b-2) instead of the crew's (7a-1). */
  readonly guidePicks?: { readonly name: string } | undefined;
  readonly otherDays?: { readonly on: boolean } | undefined;
}

export function filterChips(input: ChipInput): PlanningChip[] {
  const chips: PlanningChip[] = [];
  const { day, filter } = input;
  if (day !== null && input.otherDays === undefined) {
    const n = day.dayNo;
    const name = input.weekday;
    chips.push({
      key: DAY_CHIP,
      label: name === '' ? t({ id: 'plan.tripMap.chip.day', message: `Day ${n}` }) : name,
      selected: input.dayChosen,
      color: day.color,
    });
  }
  if (input.saved > 0) {
    chips.push({
      key: 'saved',
      label: t({ id: 'plan.tripMap.chip.saved', message: 'Saved' }),
      count: input.saved,
      selected: filter.kind === 'saved',
    });
  }
  if (input.guidePicks === undefined) {
    if (input.crewPicks !== 0) {
      chips.push({
        key: 'crew',
        label: t({ id: 'plan.tripMap.chip.crew', message: 'Crew picks' }),
        selected: filter.kind === 'crew',
      });
    }
  } else {
    const guide = input.guidePicks.name;
    chips.push({
      key: 'guide',
      label: t({ id: 'plan.tripMap.chip.guide', message: `${guide}’s picks` }),
      selected: filter.kind === 'guide',
    });
  }
  if (input.otherDays !== undefined) {
    chips.push({
      key: 'other-days',
      label: t({ id: 'plan.tripMap.chip.otherDays', message: 'Other days' }),
      selected: input.otherDays.on,
    });
  }
  for (const category of input.categories) {
    chips.push({
      key: `${CATEGORY_PREFIX}${category}`,
      label: categoryChipLabel(category),
      selected: filter.kind === 'category' && filter.category === category,
    });
  }
  return chips;
}

/** The filter after tapping chip `key` (a lit chip turns off). */
export function nextFilter(current: MapFilter, key: string): MapFilter {
  const tapped: MapFilter | null =
    key === 'saved'
      ? { kind: 'saved' }
      : key === 'crew'
        ? { kind: 'crew' }
        : key === 'guide'
          ? { kind: 'guide' }
          : key.startsWith(CATEGORY_PREFIX)
            ? { kind: 'category', category: key.slice(CATEGORY_PREFIX.length) }
            : null;
  if (tapped === null) return current;
  const same =
    tapped.kind === current.kind &&
    (tapped.kind !== 'category' ||
      (current.kind === 'category' && current.category === tapped.category));
  return same ? NO_FILTER : tapped;
}
