import { useState } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';

export interface RangePrivateMarkersProps {
  readonly min: number;
  readonly max: number;
  /** Everyone's private maxes, shown only as anonymous dots (never labelled or ordered by person). */
  readonly markers: readonly number[];
  /** The computed sweet spot, drawn as the big knob. */
  readonly sweetSpot: number;
  readonly minLabel: string;
  readonly maxLabel: string;
  /** Caption between the end labels ("each dot is someone's max"). */
  readonly caption?: string;
  /** Screen-reader summary ("Sweet spot $1,350 each, under all 6 maxes"). */
  readonly summary: string;
}

const DOT = 16;
const KNOB = 32;

const useStyles = makeStyles((t) => ({
  lane: { height: KNOB, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, backgroundColor: t.color.ink[850], opacity: 0.18 },
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: t.color.ink[850],
    backgroundColor: t.color.paper.bright,
  },
  knobBar: {
    position: 'absolute',
    height: 8,
    width: KNOB * 1.8,
    borderRadius: 4,
    backgroundColor: t.color.ink[850],
  },
  knob: {
    position: 'absolute',
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    backgroundColor: t.color.ink[850],
  },
  caption: { flex: 1, textAlign: 'center' },
}));

/**
 * The private-budget range (3c-5): a sweet-spot knob among anonymous dots, one per crew member's
 * private max. Individual values are never exposed to assistive tech either: only `summary` is read.
 */
export function RangePrivateMarkers({
  min,
  max,
  markers,
  sweetSpot,
  minLabel,
  maxLabel,
  caption,
  summary,
}: RangePrivateMarkersProps) {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const span = Math.max(1, max - min);
  const at = (value: number, size: number) =>
    ((Math.min(max, Math.max(min, value)) - min) / span) * Math.max(0, width - size);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return (
    <Stack gap="8" accessible accessibilityRole="summary" accessibilityLabel={summary}>
      <View style={styles.lane} onLayout={onLayout}>
        <View style={styles.track} />
        {width > 0 ? (
          <>
            <View style={[styles.knobBar, { start: at(sweetSpot, KNOB * 1.8) }]} />
            {[...markers]
              .sort((a, b) => a - b)
              .map((marker, index) => (
                <View key={index} style={[styles.dot, { start: at(marker, DOT) }]} />
              ))}
            <View style={[styles.knob, { start: at(sweetSpot, KNOB) }]} />
          </>
        ) : null}
      </View>
      <Row align="center" gap="8">
        <Text variant="monoData">{minLabel}</Text>
        {caption ? (
          <Text variant="monoData" style={styles.caption}>
            {caption}
          </Text>
        ) : (
          <View style={styles.caption} />
        )}
        <Text variant="monoData">{maxLabel}</Text>
      </Row>
    </Stack>
  );
}
