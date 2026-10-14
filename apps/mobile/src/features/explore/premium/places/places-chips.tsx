/**
 * The premium places filter chips (4.34): All, Saved, In the plan, then the kinds of place the
 * destination has, fullest first, each with its count. One at a time; the chosen chip is ink. Over
 * the map the others are glass; on the list they sit on the control fill.
 */
import { Chip, ScrollRow, usePremiumTheme } from '@/ui/premium';

import { placeCounts, type HubPlace, type PlacesFilter } from '../../places/places-model';
import { placesWords } from './places-words';

interface Chip {
  readonly filter: PlacesFilter;
  readonly count: number;
}

export function placesChips(places: readonly HubPlace[], chosen: PlacesFilter): Chip[] {
  const counts = placeCounts(places);
  const chips: Chip[] = [{ filter: 'all', count: counts.all }];
  if (counts.saved > 0 || chosen === 'saved') chips.push({ filter: 'saved', count: counts.saved });
  if (counts.plan > 0 || chosen === 'plan') chips.push({ filter: 'plan', count: counts.plan });
  for (const { group, count } of counts.groups) chips.push({ filter: group, count });
  if (!chips.some((chip) => chip.filter === chosen)) chips.push({ filter: chosen, count: 0 });
  return chips;
}

export function PlacesChips(props: {
  readonly places: readonly HubPlace[];
  readonly filter: PlacesFilter;
  readonly onFilter: (filter: PlacesFilter) => void;
  readonly over: 'map' | 'list';
}) {
  const theme = usePremiumTheme();
  return (
    // Flat chips need no room; the glass ones over the map keep room for their soft shadow (a wider
    // band would take the map's touches under the row).
    <ScrollRow
      gap={theme.space.gap6}
      above={4}
      below={12}
      contentContainerStyle={{ paddingHorizontal: theme.space.gap16 }}
      testID="places-chips"
    >
      {placesChips(props.places, props.filter).map(({ filter, count }) => {
        const on = filter === props.filter;
        return (
          <Chip
            key={filter}
            label={`${placesWords.filter(filter)} ${String(count)}`}
            selected={on}
            size="hub"
            surface={props.over === 'map' ? 'glass' : 'control'}
            onPress={() => props.onFilter(on && filter !== 'all' ? 'all' : filter)}
            testID={`places-chip-${filter}`}
          />
        );
      })}
    </ScrollRow>
  );
}
