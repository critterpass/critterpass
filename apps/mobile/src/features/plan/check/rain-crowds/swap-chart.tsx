/**
 * The rain and crowds chart (7h-4): four lanes over the day's hours. RAIN is the wet stretch as a
 * dotted band (forecast or the month's usual), CROWDS the busiest place's hourly bars, NOW the
 * day's blocks as they are (a block in the way pulses pink) and SWAPPED where they would go; a
 * ticked swap slides its block into place, an unticked one stays where it was.
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface ChartBlock {
  readonly key: string;
  /** Local minutes of the day. */
  readonly start: number;
  readonly end: number;
  readonly color: string;
  readonly inTheWay: boolean;
}

export interface SwapChartProps {
  readonly rain: { readonly from: number; readonly to: number } | null;
  readonly crowds: readonly number[] | null;
  readonly busyLevel: number;
  readonly now: readonly ChartBlock[];
  readonly swapped: readonly ChartBlock[];
  readonly width: number;
  readonly reducedMotion: boolean;
}

export const CHART_FROM = 7 * 60;
export const CHART_TO = 20 * 60;
const LABEL_W = 72;
const LANE_H = 18;
const TICKS = [7, 9, 11, 13, 15, 17, 19];

const useStyles = makeStyles((th) => ({
  chart: {
    gap: th.space['10'],
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
  lane: { flexDirection: 'row', alignItems: 'center' },
  label: { width: LABEL_W },
  track: { height: LANE_H, flex: 1 },
  block: { position: 'absolute', top: 0, height: LANE_H, borderRadius: 4 },
  rain: {
    position: 'absolute',
    top: 0,
    height: LANE_H,
    borderRadius: 4,
    backgroundColor: tokens.color.blue,
    opacity: 0.55,
    borderWidth: 1.5,
    borderStyle: 'dotted',
    borderColor: tokens.color.paper.base,
  },
  bar: { position: 'absolute', bottom: 0, borderRadius: 2 },
  ticks: { flexDirection: 'row', marginLeft: LABEL_W, height: 14 },
}));

function BlockView({
  block,
  left,
  width,
  pulse,
  reducedMotion,
  style,
}: {
  readonly block: ChartBlock;
  readonly left: number;
  readonly width: number;
  readonly pulse: boolean;
  readonly reducedMotion: boolean;
  readonly style: object;
}) {
  const opacity = useSharedValue(1);
  const on = pulse && block.inTheWay && !reducedMotion;
  useEffect(() => {
    opacity.value = on
      ? withRepeat(withTiming(0.45, { duration: tokens.motion.duration.extra }), -1, true)
      : 1;
  }, [on, opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      layout={reducedMotion ? undefined : LinearTransition.springify()}
      style={[
        style,
        fade,
        {
          left,
          width,
          backgroundColor: block.color,
          borderWidth: pulse && block.inTheWay ? 2 : 0,
          borderColor: tokens.color.pink,
        },
      ]}
    />
  );
}

export function SwapChart(props: SwapChartProps) {
  const styles = useStyles();
  const theme = useTheme();
  const track = props.width - 28 - LABEL_W;
  const x = (minute: number) =>
    (Math.max(0, Math.min(CHART_TO, minute) - CHART_FROM) / (CHART_TO - CHART_FROM)) * track;
  const lane = (label: string, body: React.ReactNode) => (
    <View style={styles.lane}>
      <Text variant="label" color={theme.semantic.text.secondary} style={styles.label}>
        {label}
      </Text>
      <View style={styles.track}>{body}</View>
    </View>
  );
  const blocks = (list: readonly ChartBlock[], pulse: boolean) =>
    list.map((block) => (
      <BlockView
        key={block.key}
        block={block}
        left={x(block.start)}
        width={Math.max(6, x(block.end) - x(block.start))}
        pulse={pulse}
        reducedMotion={props.reducedMotion}
        style={styles.block}
      />
    ));
  const bars = props.crowds ?? [];
  return (
    <View style={styles.chart} testID="plan-rain-chart">
      {lane(
        t({ id: 'plan.check.rain.laneRain', message: 'Rain' }),
        props.rain === null ? null : (
          <View
            style={[
              styles.rain,
              { left: x(props.rain.from), width: x(props.rain.to) - x(props.rain.from) },
            ]}
          />
        ),
      )}
      {lane(
        t({ id: 'plan.check.rain.laneCrowds', message: 'Crowds' }),
        bars.map((level, hour) =>
          hour * 60 < CHART_FROM || hour * 60 >= CHART_TO ? null : (
            <View
              key={hour}
              style={[
                styles.bar,
                {
                  left: x(hour * 60) + 1,
                  width: Math.max(2, x(hour * 60 + 60) - x(hour * 60) - 2),
                  height: Math.max(2, (level / 100) * LANE_H),
                  backgroundColor:
                    level >= props.busyLevel
                      ? theme.semantic.text.secondary
                      : theme.semantic.bg.control,
                },
              ]}
            />
          ),
        ),
      )}
      {lane(t({ id: 'plan.check.rain.laneNow', message: 'Now' }), blocks(props.now, true))}
      {lane(
        t({ id: 'plan.check.rain.laneSwapped', message: 'Swapped' }),
        blocks(props.swapped, false),
      )}
      <View style={styles.ticks}>
        {TICKS.map((hour) => (
          <Text
            key={hour}
            variant="monoData"
            color={theme.semantic.text.secondary}
            style={{ position: 'absolute', left: x(hour * 60) - 8 }}
          >
            {String(hour).padStart(2, '0')}
          </Text>
        ))}
      </View>
    </View>
  );
}
