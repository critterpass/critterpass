/**
 * Pills on the map's edge for stops of the chosen day that are off screen ("1 ← JATILUWIH", 7a-1,
 * 7b-1). Laid over the map (not on it), level with the stop along the edge it lies beyond; a tap
 * flies there.
 */
import { tokens } from '@cp/design-tokens';
import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import { useLingui } from '@lingui/react/macro';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '../../text/Text';
import { makeStyles } from '../../theme';
import { edgePlacement, type EdgeSide, type ViewSize } from './edge-position';

export interface EdgeStop {
  readonly id: string;
  readonly n: number;
  readonly name: string;
  readonly color: string;
  readonly lat: number;
  readonly lng: number;
}

export interface EdgeIndicatorProps {
  readonly stops: readonly EdgeStop[];
  /** The map's visible bounds, from its last region change. */
  readonly bounds: LngLatBounds | null;
  readonly size: ViewSize;
  /** Map covered at the head (search, chips) and foot (the sheet). */
  readonly coveredTop?: number | undefined;
  readonly coveredBottom?: number | undefined;
  readonly onPress?: ((stopId: string) => void) | undefined;
}

const ARROWS: Readonly<Record<EdgeSide, string>> = { left: '←', right: '→', top: '↑', bottom: '↓' };
const PILL_HEIGHT = 32;
const EDGE_GAP = tokens.space['8'];

const useStyles = makeStyles((t) => ({
  anchor: { position: 'absolute', width: 0, height: 0, alignItems: 'center' },
  pill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['6'],
    height: PILL_HEIGHT,
    paddingStart: t.space['4'],
    paddingEnd: t.space['12'],
    borderRadius: PILL_HEIGHT / 2,
    borderWidth: 2,
    backgroundColor: t.semantic.bg.base,
  },
  number: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export function EdgeIndicator({
  stops,
  bounds,
  size,
  coveredTop = 0,
  coveredBottom = 0,
  onPress,
}: EdgeIndicatorProps) {
  const styles = useStyles();
  const { t } = useLingui();
  if (bounds === null || size.width === 0) return null;
  const margin = { top: coveredTop + PILL_HEIGHT, bottom: coveredBottom + PILL_HEIGHT, side: 80 };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {stops.map((stop) => {
        const placement = edgePlacement(stop.lng, stop.lat, bounds, size, margin);
        if (placement === null) return null;
        const vertical = placement.side === 'left' || placement.side === 'right';
        const anchorStyle = vertical
          ? { top: placement.along, [placement.side]: EDGE_GAP + PILL_HEIGHT / 2 }
          : { left: placement.along, [placement.side]: EDGE_GAP + PILL_HEIGHT / 2 };
        const pillStyle = vertical
          ? placement.side === 'left'
            ? { left: -PILL_HEIGHT / 2, top: -PILL_HEIGHT / 2 }
            : { right: -PILL_HEIGHT / 2, top: -PILL_HEIGHT / 2 }
          : { top: -PILL_HEIGHT / 2 };
        return (
          <View key={stop.id} style={[styles.anchor, anchorStyle]} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t({
                id: 'kit.edgeIndicator.label',
                message: `Stop ${stop.n}, ${stop.name}, off the map. Show it`,
              })}
              onPress={() => onPress?.(stop.id)}
              style={[styles.pill, { borderColor: stop.color }, pillStyle]}
              testID={`edge-stop-${stop.id}`}
            >
              <View style={[styles.number, { backgroundColor: stop.color }]}>
                <Text variant="label" color={tokens.color.paper.bright}>
                  {String(stop.n)}
                </Text>
              </View>
              <Text variant="label">{`${ARROWS[placement.side]} ${stop.name}`}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
