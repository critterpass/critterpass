/**
 * The premium places filter chips (4.34): All, Saved, In the plan, then the kinds of place the
 * destination has, fullest first, each with its count. One at a time; the chosen chip is ink. Over
 * the map the others are glass; on the list they sit on the control fill.
 */
import { ScrollView, View } from 'react-native';

import { GlassSurface, PressableScale, Text, usePremiumTheme } from '@/ui/premium';

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
  const chip = {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
  } as const;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.space.gap6, paddingHorizontal: theme.space.gap16 }}
      testID="places-chips"
    >
      {placesChips(props.places, props.filter).map(({ filter, count }) => {
        const on = filter === props.filter;
        const label = `${placesWords.filter(filter)} ${String(count)}`;
        const body = (
          <Text variant="segment" tone={on ? 'onInk' : 'ink'} numberOfLines={1}>
            {label}
          </Text>
        );
        return (
          <PressableScale
            key={filter}
            onPress={() => props.onFilter(on && filter !== 'all' ? 'all' : filter)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={label}
            testID={`places-chip-${filter}`}
          >
            {on ? (
              <View style={[chip, { backgroundColor: theme.color.inkSurface }]}>{body}</View>
            ) : props.over === 'map' ? (
              <GlassSurface kind="nav" style={chip}>
                {body}
              </GlassSurface>
            ) : (
              <View style={[chip, { backgroundColor: theme.color.control }]}>{body}</View>
            )}
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}
