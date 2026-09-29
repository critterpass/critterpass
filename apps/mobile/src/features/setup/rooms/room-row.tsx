/**
 * One room of a stay card (3c-6): "ROOM n", the people in it and the guide's grouping pill. The
 * row measures itself so a dragged avatar can find it, turns into a button while someone is
 * picked (tap-to-move), and shakes when a drop finds it full.
 */
import { t } from '@lingui/core/macro';
import { useEffect, useRef, type ComponentRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { useMotionMode } from '@/motion/motion-mode';
import { Row } from '@/ui/layout/Row';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { traitName } from './copy';
import { DraggableAvatar } from './draggable-avatar';
import type { PlanRoom } from './model';

const SHAKE_PT = 6;

const useStyles = makeStyles((th) => ({
  row: {
    borderRadius: th.radius.md,
    paddingHorizontal: th.space['12'],
    paddingVertical: th.space['6'],
    minHeight: th.space['32'] + th.space['16'],
    gap: th.space['12'],
  },
  band: { ...StyleSheet.absoluteFill, borderRadius: th.radius.md, opacity: 0.14 },
  label: { minWidth: th.space['32'] * 2 },
  people: { flex: 1 },
  overlap: { marginStart: -th.space['8'] },
  shell: { borderRadius: th.radius.md },
  pill: {
    borderRadius: th.radius.pill,
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
    flexShrink: 1,
  },
  target: { borderWidth: th.ring.focus.widthPt, borderColor: th.ring.focus.color },
}));

export interface RoomRowPerson {
  readonly uid: string;
  readonly name: string;
  readonly joinIndex: number;
}

export interface RoomRowProps {
  readonly index: number;
  readonly room: PlanRoom;
  readonly people: ReadonlyMap<string, RoomRowPerson>;
  /** The card's accent: the pill's text. */
  readonly accent: string;
  readonly editable: boolean;
  readonly selectedUid: string | null;
  readonly mine: boolean;
  /** Bumped each time a drop onto this room is refused. */
  readonly rejectCount: number;
  readonly onSelect: (uid: string) => void;
  readonly onMoveHere: () => void;
  readonly onLift: () => void;
  readonly onDrop: (uid: string, x: number, y: number) => void;
  readonly onMeasure: (rect: { x: number; y: number; width: number; height: number }) => void;
}

export function RoomRow({
  index,
  room,
  people,
  accent,
  editable,
  selectedUid,
  mine,
  rejectCount,
  onSelect,
  onMoveHere,
  onLift,
  onDrop,
  onMeasure,
}: RoomRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [motionMode] = useMotionMode();
  const ref = useRef<ComponentRef<typeof View>>(null);
  const shake = useSharedValue(0);
  const n = index + 1;
  const title = t({ id: 'setup.rooms.room', message: `Room ${n}` });

  useEffect(() => {
    if (rejectCount === 0 || motionMode !== 'full') return;
    const step = { duration: tokens.motion.duration.instant / 3 };
    shake.value = withSequence(
      withTiming(-SHAKE_PT, step),
      withTiming(SHAKE_PT, step),
      withTiming(-SHAKE_PT / 2, step),
      withTiming(0, step),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [rejectCount, motionMode]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const measure = () =>
    ref.current?.measureInWindow((x, y, width, height) => onMeasure({ x, y, width, height }));
  const canReceive = editable && selectedUid !== null && !room.occupants.includes(selectedUid);
  const names = room.occupants.map((uid) => people.get(uid)?.name ?? '').join(', ');
  const trait = room.trait === null ? null : traitName(room.trait);

  const body = (
    <Row align="center" style={styles.row}>
      <View
        style={[styles.band, { backgroundColor: theme.semantic.text.onAccent }]}
        pointerEvents="none"
      />
      <View style={styles.label}>
        <Text variant="label">{title}</Text>
      </View>
      <Row align="center" style={styles.people}>
        {room.occupants.map((uid, place) => {
          const person = people.get(uid);
          return (
            <View key={uid} style={place > 0 ? styles.overlap : null}>
              <DraggableAvatar
                uid={uid}
                name={person?.name ?? ''}
                joinIndex={person?.joinIndex ?? 0}
                selected={uid === selectedUid}
                draggable={editable}
                highlight={false}
                onSelect={onSelect}
                onLift={onLift}
                onDrop={onDrop}
              />
            </View>
          );
        })}
      </Row>
      {trait === null ? null : (
        <View style={[styles.pill, { backgroundColor: theme.semantic.text.onAccent }]}>
          <Text variant="label" color={accent} numberOfLines={1} adjustsFontSizeToFit>
            {trait}
          </Text>
        </View>
      )}
    </Row>
  );
  const spoken = [title, names, trait].filter(Boolean).join(', ');
  return (
    <Animated.View
      ref={ref}
      onLayout={measure}
      style={[styles.shell, shakeStyle, canReceive || mine ? styles.target : null]}
      testID={`setup-rooms-room-${room.key}`}
    >
      {canReceive ? (
        <PressScale
          onPress={onMoveHere}
          accessibilityLabel={t({
            id: 'setup.rooms.a11y.moveHere',
            message: `Move here: ${spoken}`,
          })}
          testID={`setup-rooms-move-${room.key}`}
        >
          {body}
        </PressScale>
      ) : (
        <View accessible={!editable} accessibilityLabel={spoken}>
          {body}
        </View>
      )}
    </Animated.View>
  );
}
