/**
 * Where the crew sleeps on the premium map: an ink pill with a yellow square and the stay's short
 * name ("Villa"), or the bare ink square on small maps. One per map, so a `Marker` view.
 */
import { Marker, type LngLat } from '@maplibre/maplibre-react-native';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/ui/premium';

import { MAP_INK } from './palette';

export interface StayFlagProps {
  readonly lngLat: LngLat;
  /** The stay's short name; without it the flag is the bare square (mini maps, the island). */
  readonly label?: string | null | undefined;
  readonly accessibilityLabel: string;
}

const styles = StyleSheet.create({
  flag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: MAP_INK,
    borderRadius: 14,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 7,
    paddingRight: 10,
    shadowColor: '#141628',
    shadowOpacity: 0.28,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  square: { width: 16, height: 16, borderRadius: 5, backgroundColor: '#ffd84a' },
  bare: {
    width: 12,
    height: 12,
    borderRadius: 4,
    backgroundColor: MAP_INK,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
});

export function StayFlag({ lngLat, label, accessibilityLabel }: StayFlagProps) {
  const hasLabel = label !== null && label !== undefined && label !== '';
  return (
    <Marker lngLat={lngLat} anchor="center">
      <View
        style={hasLabel ? styles.flag : styles.bare}
        accessible
        accessibilityLabel={accessibilityLabel}
        testID="stay-flag"
      >
        {hasLabel ? (
          <>
            <View style={styles.square} />
            <Text variant="badge" tone="onInk" numberOfLines={1}>
              {label}
            </Text>
          </>
        ) : null}
      </View>
    </Marker>
  );
}
