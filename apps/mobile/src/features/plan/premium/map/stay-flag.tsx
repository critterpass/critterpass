/**
 * Where the crew sleeps on the premium map: an ink pill with a yellow square and the stay's short
 * name ("Villa"), or the bare ink square on small maps. One per map, so a `Marker` view.
 */
import { Marker, type LngLat } from '@maplibre/maplibre-react-native';
import { View } from 'react-native';

import { makePremiumStyles, Text } from '@/ui/premium';

import { MAP_MARKS } from './palette';

export interface StayFlagProps {
  readonly lngLat: LngLat;
  /** The stay's short name; without it the flag is the bare square (mini maps, the island). */
  readonly label?: string | null | undefined;
  readonly accessibilityLabel: string;
}

const useStyles = makePremiumStyles((t) => ({
  flag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: MAP_MARKS.ink,
    borderRadius: 14,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 7,
    paddingRight: 10,
    boxShadow: t.shadow.float,
  },
  square: { width: 16, height: 16, borderRadius: 5, backgroundColor: t.accent.sun },
  bare: {
    width: 12,
    height: 12,
    borderRadius: 4,
    backgroundColor: MAP_MARKS.ink,
    borderWidth: 2,
    borderColor: MAP_MARKS.pinRing,
  },
}));

export function StayFlag({ lngLat, label, accessibilityLabel }: StayFlagProps) {
  const styles = useStyles();
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
