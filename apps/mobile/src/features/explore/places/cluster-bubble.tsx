/**
 * A count bubble for Tokek's dots gathered together (7c-1 "23", "12"): a dark disc with its count,
 * bigger for more places, dimmed with the rest when the filter leaves all of its places out. A tap
 * opens it up. A live `Marker`, so the count reads on any map style.
 */
import { tokens } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { Marker } from '@maplibre/maplibre-react-native';
import { Pressable } from 'react-native';

import { DIMMED_OPACITY } from '@/ui/map/planning';
import { Text } from '@/ui/text/Text';

import type { DotCluster } from './place-clusters';

const { color } = tokens;

/** 32 pt for a pair, up to 48 pt for fifty places or more. */
export function bubbleSize(count: number): number {
  return Math.round(32 + 16 * Math.min(1, Math.max(0, (count - 2) / 48)));
}

export interface ClusterBubbleProps {
  readonly cluster: DotCluster;
  readonly onPress: (cluster: DotCluster) => void;
}

export function ClusterBubble({ cluster, onPress }: ClusterBubbleProps) {
  const { t } = useLingui();
  const size = bubbleSize(cluster.count);
  const count = cluster.count;
  return (
    <Marker lngLat={[cluster.lng, cluster.lat]} anchor="center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t({
          id: 'places.cluster',
          message: `${count} places here. Tap to spread them out.`,
        })}
        onPress={() => onPress(cluster)}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: color.ink[800],
          borderWidth: 3,
          borderColor: color.ink[600],
          opacity: cluster.dimmed ? DIMMED_OPACITY : 1,
        }}
        testID="places-cluster"
      >
        <Text variant="label" color={color.paper.base} numberOfLines={1}>
          {String(count)}
        </Text>
      </Pressable>
    </Marker>
  );
}
