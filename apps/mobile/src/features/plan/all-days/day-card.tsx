/**
 * One day on all days (7b-3): its route redrawn small (the stops as dots a finger can hold), the
 * day's date in its colour with the pace bars, title, a short summary and its tag. While a stop is
 * dragged the card under it glows. MOVE A STOP at the card's foot opens the day's stops to pick
 * from: the way to move one that can be seen (a hold on the card competed with the dots under the
 * finger and worked only some of the time).
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';

import type { DayItem } from '@/data/plan/plan-model';
import { PillButton } from '@/ui/buttons/PillButton';
import { MiniRouteSketch, PaceBars, PlanningTag, sketchLayout } from '@/ui/planning';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { tagColor, tagLabel, withArea } from '../trip-map/format';
import { paceWords } from '../trip-map/sheet-copy';
import type { TripDay } from '../trip-map/trip-days';
import type { CardRect } from './use-cross-day-drag';

const SKETCH_HEIGHT = 64;
const DOT_HIT = 28;
const LIFT_MS = 320;

const useStyles = makeStyles((t) => ({
  card: {
    padding: t.space['12'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    borderWidth: 2,
    borderColor: t.semantic.bg.raised,
    gap: t.space['6'],
  },
  over: { borderColor: t.semantic.action.primary },
  pressed: { opacity: 0.85 },
  sketch: { height: SKETCH_HEIGHT },
  dot: { position: 'absolute', width: DOT_HIT, height: DOT_HIT },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: t.space['6'],
  },
  summary: { flex: 1, minWidth: 0 },
  name: { flex: 1, minWidth: 0 },
  move: { paddingTop: t.space['6'], alignItems: 'flex-start' },
}));

export interface DayCardProps {
  readonly day: TripDay;
  /** The day by its date ("Sat, 10/17"); empty while it has none. */
  readonly name: string;
  readonly summary: string;
  readonly over: boolean;
  readonly canMove: boolean;
  readonly onOpen: () => void;
  readonly onMoveMenu: () => void;
  readonly onRect: (rect: CardRect) => void;
  /** Changes when a drag starts: the card measures where it is on screen again. */
  readonly measureKey: number;
  readonly onHold: (stop: DayItem) => void;
  readonly onDrag: (x: number, y: number) => void;
  readonly onDrop: (x: number, y: number) => void;
}

function HeldDot({
  stop,
  x,
  y,
  props,
}: {
  readonly stop: DayItem;
  readonly x: number;
  readonly y: number;
  readonly props: DayCardProps;
}) {
  const styles = useStyles();
  const hold = () => props.onHold(stop);
  const pan = Gesture.Pan()
    .enabled(props.canMove)
    .activateAfterLongPress(LIFT_MS)
    .onStart(() => {
      'worklet';
      scheduleOnRN(hold);
    })
    .onUpdate((event) => {
      'worklet';
      scheduleOnRN(props.onDrag, event.absoluteX, event.absoluteY);
    })
    .onEnd((event) => {
      'worklet';
      scheduleOnRN(props.onDrop, event.absoluteX, event.absoluteY);
    });
  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.dot, { left: x - DOT_HIT / 2, top: y - DOT_HIT / 2 }]}
        accessibilityElementsHidden
        testID={`all-days-dot-${stop.stableId}`}
      />
    </GestureDetector>
  );
}

export function AllDaysCard(props: DayCardProps) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const { day } = props;
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [width, setWidth] = useState(0);
  const { onRect, measureKey } = props;
  const measure = () =>
    ref.current?.measureInWindow((x, y, w, h) =>
      onRect({ dayNo: day.dayNo, x, y, width: w, height: h }),
    );
  useEffect(() => {
    measure();
    // Measured again on each new drag (the grid may have scrolled since it was laid out).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureKey]);
  const placed = day.stops.filter((stop) => stop.place !== null);
  const points = placed.map((stop) => stop.place ?? { lat: 0, lng: 0 });
  const layout = width === 0 ? [] : sketchLayout(points, width, SKETCH_HEIGHT);
  const n = day.dayNo;
  const name = withArea(props.name === '' ? String(n) : props.name, day);
  const title = day.theme ?? t({ id: 'plan.allDays.dayTitle', message: `Day ${n}` });
  const moveLabel = t({ id: 'plan.allDays.moveStop', message: 'Move a stop to another day' });
  return (
    <View ref={ref} onLayout={measure} testID={`all-days-card-${String(n)}`}>
      <Pressable
        onPress={props.onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${title}, ${props.summary}`}
        accessibilityActions={props.canMove ? [{ name: 'moveStop', label: moveLabel }] : []}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'moveStop') props.onMoveMenu();
        }}
        style={({ pressed }) => (pressed ? styles.pressed : null)}
      >
        <View style={[styles.card, props.over ? styles.over : null]}>
          <View
            style={styles.sketch}
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          >
            {placed.length === 0 ? (
              <Text variant="monoData" color={theme.semantic.text.secondary}>
                {t({ id: 'plan.allDays.nothingYet', message: 'nothing yet' })}
              </Text>
            ) : width === 0 ? null : (
              <>
                <MiniRouteSketch
                  points={points}
                  color={day.color}
                  width={width}
                  height={SKETCH_HEIGHT}
                />
                {placed.map((stop, index) => (
                  <HeldDot
                    key={stop.stableId}
                    stop={stop}
                    x={layout[index]?.x ?? 0}
                    y={layout[index]?.y ?? 0}
                    props={props}
                  />
                ))}
              </>
            )}
          </View>
          <View style={styles.row}>
            <Text variant="label" color={day.color} numberOfLines={1} style={styles.name}>
              {name}
            </Text>
            <PaceBars level={day.pace} color={day.color} accessibilityLabel={paceWords(day)} />
          </View>
          <Text variant="title" numberOfLines={1}>
            {title}
          </Text>
          <View style={styles.row}>
            <Text
              variant="bodySm"
              color={theme.semantic.text.secondary}
              numberOfLines={1}
              style={styles.summary}
            >
              {props.summary}
            </Text>
            {day.tag === null ? null : (
              <PlanningTag label={tagLabel(day.tag, true)} color={tagColor(day.tag)} />
            )}
          </View>
        </View>
      </Pressable>
      {/* Outside the card's own press: a tap on it must never open the day instead. */}
      {props.canMove && day.stops.length > 0 ? (
        <View style={styles.move}>
          <PillButton
            size="sm"
            variant="secondary"
            label={t({ id: 'plan.allDays.moveStopShort', message: 'Move a stop' })}
            accessibilityHint={moveLabel}
            onPress={props.onMoveMenu}
            testID={`all-days-move-${String(n)}`}
          />
        </View>
      ) : null}
    </View>
  );
}
