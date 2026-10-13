/**
 * One day of All days (4.28): its date in the day's colour with its pace, its stops as a small
 * route of numbered pins, its title and what it holds. A tap opens the day; holding the card
 * offers "Move a stop". Holding a pin lifts that stop: drag it over another day's card (which lights up) and let go to
 * see the move before it is made. The card tells the screen where it sits, so a drop finds it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- keys and transforms, never copy. */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import type { DayItem } from '@/data/plan/plan-model';
import { useLocale } from '@/lib/i18n/use-locale';
import { PressableScale, ring, Text, usePremiumTheme } from '@/ui/premium';
import { sketchLayout } from '@/ui/planning';

import type { CardRect } from '../../all-days/use-cross-day-drag';
import { clock } from '../../day/format';
import { dateLine } from '../../trip-map/format';
import { daySummary } from '../../trip-map/sheet-copy';
import type { TripDay } from '../../trip-map/trip-days';
import { dayColours } from '../map';

const PINS = 6;
const SKETCH_H = 52;
const PIN = 18;
const LINE = 2;
const PACE = 5;
/** How long a pin is held before it lifts (a shorter hold is the card's own long press). */
const LIFT_MS = 320;

export interface DayTileProps {
  readonly day: TripDay;
  /** A held stop is over this card. */
  readonly over: boolean;
  readonly canMove: boolean;
  /** Changes when a drag starts: the card measures where it is on screen again. */
  readonly measureKey: number;
  readonly onOpen: () => void;
  readonly onMoveMenu: () => void;
  readonly onRect: (rect: CardRect) => void;
  readonly onHold: (stop: DayItem) => void;
  readonly onDrag: (x: number, y: number) => void;
  readonly onDrop: (x: number, y: number) => void;
}

function Pin(props: {
  readonly stop: DayItem;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly colour: string;
  readonly tile: DayTileProps;
}) {
  const theme = usePremiumTheme();
  const { tile, stop } = props;
  const hold = () => tile.onHold(stop);
  const pan = Gesture.Pan()
    .enabled(tile.canMove)
    .activateAfterLongPress(LIFT_MS)
    .onStart(() => {
      'worklet';
      scheduleOnRN(hold);
    })
    .onUpdate((event) => {
      'worklet';
      scheduleOnRN(tile.onDrag, event.absoluteX, event.absoluteY);
    })
    .onEnd((event) => {
      'worklet';
      scheduleOnRN(tile.onDrop, event.absoluteX, event.absoluteY);
    });
  return (
    <GestureDetector gesture={pan}>
      <View
        hitSlop={5}
        accessibilityElementsHidden
        testID={`all-days-dot-${stop.stableId}`}
        style={{
          position: 'absolute',
          left: props.x - PIN / 2,
          top: props.y - PIN / 2,
          width: PIN,
          height: PIN,
          borderRadius: PIN / 2,
          borderWidth: 1.5,
          borderColor: theme.accent.stickerEdge,
          backgroundColor: props.colour,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="badge" tone="onInk">
          {String(props.index + 1)}
        </Text>
      </View>
    </GestureDetector>
  );
}

/** The day's placed stops as a small route: numbered pins where they sit, joined in order. */
function DayRoute(props: {
  readonly stops: readonly DayItem[];
  readonly width: number;
  readonly colour: string;
  readonly tile: DayTileProps;
}) {
  const layout = sketchLayout(
    props.stops.map((stop) => stop.place ?? { lat: 0, lng: 0 }),
    props.width - PIN,
    SKETCH_H - PIN,
  ).map((at) => ({ x: at.x + PIN / 2, y: at.y + PIN / 2 }));
  return (
    <>
      {layout.slice(1).map((to, index) => {
        const from = layout[index] ?? to;
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        const angle = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
        return (
          <View
            key={`line-${String(index)}`}
            style={{
              position: 'absolute',
              height: LINE,
              width: length,
              left: (from.x + to.x) / 2 - length / 2,
              top: (from.y + to.y) / 2 - LINE / 2,
              backgroundColor: props.colour,
              opacity: 0.6,
              transform: [{ rotate: `${String(angle)}deg` }],
            }}
          />
        );
      })}
      {props.stops.map((stop, index) => (
        <Pin
          key={stop.stableId}
          stop={stop}
          index={index}
          x={layout[index]?.x ?? 0}
          y={layout[index]?.y ?? 0}
          colour={props.colour}
          tile={props.tile}
        />
      ))}
    </>
  );
}

export function DayTile(props: DayTileProps) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { day, onRect, measureKey } = props;
  const ref = useRef<ComponentRef<typeof View>>(null);
  const measure = () =>
    ref.current?.measureInWindow((x, y, width, height) =>
      onRect({ dayNo: day.dayNo, x, y, width, height }),
    );
  useEffect(() => {
    measure();
    // Measured again on each new drag (the grid may have scrolled since it was laid out).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureKey]);
  const [width, setWidth] = useState(0);
  const placed = day.stops.filter((stop) => stop.place !== null).slice(0, PINS);
  const colours = dayColours(day.dayNo);
  const pace = Math.max(0, Math.min(PACE, Math.round(day.pace)));
  return (
    <View ref={ref} onLayout={measure} style={{ width: '48.5%' }}>
      <PressableScale
        onPress={props.onOpen}
        onLongPress={props.canMove ? props.onMoveMenu : undefined}
        accessibilityRole="button"
        accessibilityLabel={`${day.date === null ? '' : dateLine(locale, day.date)} ${day.theme ?? ''}`}
        accessibilityHint={
          props.canMove && day.stops.length > 0
            ? t({ id: 'plan.allDays.moveStop', message: 'Move a stop to another day' })
            : undefined
        }
        testID={`all-days-card-${String(day.dayNo)}`}
        style={{
          minHeight: 150,
          borderRadius: theme.radius.banner,
          backgroundColor: theme.color.card,
          boxShadow: props.over ? ring(2, colours.fill) : theme.shadow.card,
          paddingVertical: theme.space.gap10,
          paddingHorizontal: theme.space.gap12,
          gap: theme.space.gap6,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="badge" color={colours.ink} style={{ flex: 1 }} numberOfLines={1}>
            {day.date === null ? String(day.dayNo) : dateLine(locale, day.date)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {Array.from({ length: PACE }, (_, at) => (
              <View
                key={at}
                style={{
                  width: 5,
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: at < pace ? colours.fill : theme.color.fieldBorder,
                }}
              />
            ))}
          </View>
        </View>
        <View
          style={{
            height: SKETCH_H,
            borderRadius: theme.radius.dayBadge,
            backgroundColor: theme.color.ground,
            overflow: 'hidden',
          }}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        >
          {width === 0 ? null : (
            <DayRoute stops={placed} width={width} colour={colours.route} tile={props} />
          )}
        </View>
        <Text variant="rowTextStrong" numberOfLines={1}>
          {day.theme ?? t({ id: 'plan.premium.allDays.dayN', message: `Day ${day.dayNo}` })}
        </Text>
        <Text variant="captionMuted" tone="muted" numberOfLines={2}>
          {daySummary(day, (minutes) => clock(locale, minutes))}
        </Text>
      </PressableScale>
    </View>
  );
}
