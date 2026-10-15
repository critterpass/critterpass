/**
 * The fix pages' sketches (undesigned; built from the card, the accents and the type scale): Less
 * driving's BEFORE / AFTER routes (the stay as a sun diamond, the stops as numbered pink dots in
 * route order joined by straight lines, fitted to the box) and Rain and crowds' chart (four lanes
 * over the day's hours: the wet stretch, the busiest place's hourly crowds, the day's blocks now,
 * and where the ticked swaps put them; a block in the way has a pink ring).
 */
/* eslint-disable lingui/no-unlocalized-strings -- keys and transforms, never copy. */
import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Card, ring, Text, usePremiumTheme } from '@/ui/premium';
import { sketchLayout, type SketchPoint } from '@/ui/premium/planning/planning-shapes';

import { DOT, spreadApart } from '../../check/less-driving/less-driving-props';
import {
  CHART_FROM,
  CHART_TO,
  type ChartBlock,
  type SwapChartProps,
} from '../../check/rain-crowds/rain-props';

const LINE = 2.5;
const DIAMOND = 16;
const SKETCH_H = 120;

function RouteSketch(props: {
  readonly stops: readonly SketchPoint[];
  readonly stay: SketchPoint | null;
  readonly width: number;
  readonly testID: string;
}) {
  const theme = usePremiumTheme();
  const { stops, stay, width } = props;
  const spread = spreadApart(
    sketchLayout(stay === null ? stops : [stay, ...stops], width, SKETCH_H),
    width,
    SKETCH_H,
  );
  const home = stay === null ? null : (spread[0] ?? null);
  const points = stay === null ? spread : spread.slice(1);
  const laid = home === null ? points : [home, ...points, home];
  return (
    <View
      style={{ width, height: SKETCH_H }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={props.testID}
    >
      {laid.slice(1).map((to, index) => {
        const from = laid[index] ?? to;
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
        return (
          <View
            key={`line-${String(index)}`}
            style={{
              position: 'absolute',
              height: LINE,
              borderRadius: LINE / 2,
              backgroundColor: theme.accent.pink,
              width: length,
              left: (from.x + to.x) / 2 - length / 2,
              top: (from.y + to.y) / 2 - LINE / 2,
              transform: [{ rotate: `${String(angle)}deg` }],
            }}
          />
        );
      })}
      {home === null ? null : (
        <View
          style={{
            position: 'absolute',
            width: DIAMOND,
            height: DIAMOND,
            borderRadius: 4,
            backgroundColor: theme.accent.sun,
            left: home.x - DIAMOND / 2,
            top: home.y - DIAMOND / 2,
            transform: [{ rotate: '45deg' }],
          }}
        />
      )}
      {points.map((point, index) => (
        <View
          key={`dot-${String(index)}`}
          style={{
            position: 'absolute',
            width: DOT,
            height: DOT,
            borderRadius: DOT / 2,
            backgroundColor: theme.accent.pink,
            borderWidth: 2,
            borderColor: theme.accent.stickerEdge,
            alignItems: 'center',
            justifyContent: 'center',
            left: point.x - DOT / 2,
            top: point.y - DOT / 2,
          }}
        >
          <Text variant="badge" color={theme.color.onAccent}>
            {String(index + 1)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** BEFORE and AFTER side by side, each half the card. */
export function RouteSketches(props: {
  readonly before: readonly SketchPoint[];
  readonly after: readonly SketchPoint[];
  readonly stay: SketchPoint | null;
}) {
  const theme = usePremiumTheme();
  const [width, setWidth] = useState(0);
  const half = Math.max(0, (width - theme.space.gap12) / 2);
  return (
    <Card padded testID="plan-less-driving-sketches">
      <View
        style={{ flexDirection: 'row', gap: theme.space.gap12 }}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      >
        {(['before', 'after'] as const).map((side) => (
          <View key={side} style={{ flex: 1, gap: theme.space.gap6 }}>
            <Text variant="label" tone={side === 'before' ? 'muted' : 'ink'}>
              {side === 'before'
                ? t({ id: 'plan.check.lessDriving.before', message: 'Before' })
                : t({ id: 'plan.check.lessDriving.after', message: 'After' })}
            </Text>
            {half === 0 ? null : (
              <RouteSketch
                stops={side === 'before' ? props.before : props.after}
                stay={props.stay}
                width={half}
                testID={`plan-less-driving-${side}`}
              />
            )}
          </View>
        ))}
      </View>
    </Card>
  );
}

const LABEL_W = 72;
const LANE_H = 16;
const TICKS = [7, 10, 13, 16, 19];

export function SwapChart(props: Omit<SwapChartProps, 'width' | 'reducedMotion'>) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const [width, setWidth] = useState(0);
  const track = Math.max(0, width - LABEL_W);
  const x = (minute: number) =>
    (Math.max(0, Math.min(CHART_TO, minute) - CHART_FROM) / (CHART_TO - CHART_FROM)) * track;
  const lane = (label: string, body: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Text variant="captionMuted" tone="muted" style={{ width: LABEL_W }}>
        {label}
      </Text>
      <View style={{ height: LANE_H, flex: 1 }}>{body}</View>
    </View>
  );
  const blocks = (list: readonly ChartBlock[], ringed: boolean) =>
    list.map((block) => (
      <View
        key={block.key}
        style={{
          position: 'absolute',
          top: 0,
          height: LANE_H,
          borderRadius: 4,
          left: x(block.start),
          width: Math.max(6, x(block.end) - x(block.start)),
          backgroundColor: block.color,
          ...(ringed && block.inTheWay ? { boxShadow: ring(2, theme.accent.pink) } : {}),
        }}
      />
    ));
  const hour = (h: number) =>
    new Intl.DateTimeFormat(locale, { hour: 'numeric' }).format(new Date(2026, 0, 1, h));
  return (
    <Card padded testID="plan-rain-chart">
      <View
        style={{ gap: theme.space.gap8 }}
        onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      >
        {lane(
          t({ id: 'plan.check.rain.laneRain', message: 'Rain' }),
          props.rain === null ? null : (
            <View
              style={{
                position: 'absolute',
                top: 0,
                height: LANE_H,
                borderRadius: 4,
                backgroundColor: theme.color.status.rain.bg,
                borderWidth: 1.5,
                borderStyle: 'dotted',
                borderColor: theme.color.status.rain.text,
                left: x(props.rain.from),
                width: x(props.rain.to) - x(props.rain.from),
              }}
            />
          ),
        )}
        {lane(
          t({ id: 'plan.check.rain.laneCrowds', message: 'Crowds' }),
          (props.crowds ?? []).map((level, h) =>
            h * 60 < CHART_FROM || h * 60 >= CHART_TO ? null : (
              <View
                key={h}
                style={{
                  position: 'absolute',
                  bottom: 0,
                  borderRadius: 2,
                  left: x(h * 60) + 1,
                  width: Math.max(2, x(h * 60 + 60) - x(h * 60) - 2),
                  height: Math.max(2, (level / 100) * LANE_H),
                  backgroundColor:
                    level >= props.busyLevel ? theme.color.inkSecondary : theme.color.control,
                }}
              />
            ),
          ),
        )}
        {lane(t({ id: 'plan.check.rain.laneNow', message: 'Now' }), blocks(props.now, true))}
        {lane(
          t({ id: 'plan.check.rain.laneSwapped', message: 'Swapped' }),
          blocks(props.swapped, false),
        )}
        <View style={{ marginLeft: LABEL_W, height: 14 }}>
          {TICKS.map((h) => (
            <Text
              key={h}
              variant="badge"
              tone="muted"
              style={{ position: 'absolute', left: x(h * 60) - 8 }}
            >
              {hour(h)}
            </Text>
          ))}
        </View>
      </View>
    </Card>
  );
}
