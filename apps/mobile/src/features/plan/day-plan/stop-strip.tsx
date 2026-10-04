/**
 * The open day map's strip (7b-2): the day's stops as cards along the bottom with the leg between
 * each pair ("20 MIN", "WALK"). Swiping settles on one card, and that stop is the one labelled on
 * the map; a tap on a card opens the stop's sheet.
 */
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { StopRow } from '../trip-map/stop-rows';

const CARD = 168;
const LEG = 72;
const PITCH = CARD + LEG;

const useStyles = makeStyles((t) => ({
  strip: { alignItems: 'center' },
  card: {
    width: CARD,
    padding: t.space['12'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    borderWidth: 2,
    borderColor: t.semantic.bg.raised,
    gap: t.space['4'],
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space['8'] },
  n: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  leg: { width: LEG, alignItems: 'center' },
  legPill: {
    paddingHorizontal: t.space['8'],
    paddingVertical: t.space['2'],
    borderRadius: t.radius.pill,
    backgroundColor: t.semantic.bg.sunken,
  },
}));

export interface StopStripProps {
  readonly rows: readonly StopRow[];
  readonly color: string;
  /** The leg label shown before each card (index i: the leg into stop i), short form. */
  readonly legs: readonly (string | null)[];
  readonly current: number;
  readonly onSettle: (index: number) => void;
  readonly onOpen: (row: StopRow) => void;
  readonly width: number;
}

export function StopStrip({ rows, color, legs, current, onSettle, onOpen, width }: StopStripProps) {
  const styles = useStyles();
  const theme = useTheme();
  const side = Math.max(0, (width - CARD) / 2);
  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / PITCH);
    onSettle(Math.max(0, Math.min(rows.length - 1, index)));
  };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={PITCH}
      decelerationRate="fast"
      contentContainerStyle={[styles.strip, { paddingHorizontal: side }]}
      onMomentumScrollEnd={settle}
      testID="day-map-strip"
    >
      {rows.map((row, index) => (
        <View key={row.stop.stableId} style={styles.head}>
          {index === 0 ? null : (
            <View style={styles.leg}>
              {legs[index] == null ? null : (
                <View style={styles.legPill}>
                  <Text variant="label" color={theme.semantic.text.secondary}>
                    {legs[index]}
                  </Text>
                </View>
              )}
            </View>
          )}
          <PressScale
            onPress={() => onOpen(row)}
            accessibilityRole="button"
            accessibilityLabel={[row.time, row.stop.title, row.detail].filter(Boolean).join(', ')}
            testID={`day-map-card-${String(row.n)}`}
          >
            <View style={[styles.card, index === current ? { borderColor: color } : null]}>
              <View style={styles.head}>
                <View style={[styles.n, { backgroundColor: color }]}>
                  <Text variant="label" color={theme.color.paper.bright}>
                    {String(row.n)}
                  </Text>
                </View>
                <Text variant="monoData">{row.time}</Text>
              </View>
              <Text variant="title" numberOfLines={2}>
                {row.stop.title}
              </Text>
              {row.detail === undefined ? null : (
                <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={1}>
                  {row.detail}
                </Text>
              )}
            </View>
          </PressScale>
        </View>
      ))}
    </ScrollView>
  );
}
