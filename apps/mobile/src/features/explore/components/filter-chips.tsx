/** The map's filter chips: SAVED with its count, CREW PICKS inside a trip, FOOD and OPEN NOW. */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';

import { FilterChip } from '@/ui/chips/FilterChip';
import { makeStyles } from '@/ui/theme';

import type { MapFilter } from '../map-model';

export interface FilterChipsProps {
  readonly active: ReadonlySet<MapFilter>;
  readonly counts: Readonly<Record<MapFilter, number>>;
  /** CREW PICKS only means something inside a trip. */
  readonly inTrip: boolean;
  readonly onToggle: (filter: MapFilter) => void;
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', gap: t.space['8'], paddingHorizontal: t.size.gutter },
}));

export function FilterChips({ active, counts, inTrip, onToggle }: FilterChipsProps) {
  const styles = useStyles();
  const { t, i18n } = useLingui();
  const chips: readonly {
    readonly filter: MapFilter;
    readonly label: string;
    readonly count?: number;
  }[] = [
    {
      filter: 'saved',
      label: t({ id: 'explore.map.saved', message: 'Saved' }),
      count: counts.saved,
    },
    ...(inTrip
      ? [{ filter: 'crew' as const, label: t({ id: 'explore.map.crew', message: 'Crew picks' }) }]
      : []),
    { filter: 'food', label: t({ id: 'explore.map.food', message: 'Food' }) },
    { filter: 'open', label: t({ id: 'explore.map.open', message: 'Open now' }) },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.row}>
        {chips.map((chip) => (
          <FilterChip
            key={chip.filter}
            label={upper(chip.label, i18n.locale)}
            selected={active.has(chip.filter)}
            onPress={() => onToggle(chip.filter)}
            {...(chip.count === undefined ? {} : { count: chip.count })}
            testID={`explore-map-filter-${chip.filter}`}
          />
        ))}
      </View>
    </ScrollView>
  );
}
