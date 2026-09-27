import { t } from '@lingui/core/macro';
import { useRef, useState } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { tokens } from '@cp/design-tokens';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { ActionPill } from './ActionPill';

export interface RoomOccupant {
  readonly id: string;
  readonly name: string;
  readonly avatar: ReactNode;
}

export interface Room {
  readonly id: string;
  /** "Room 1". */
  readonly name: string;
  /** Why these people share it ("Light sleepers"). */
  readonly tag?: string;
  readonly occupants: readonly RoomOccupant[];
}

export interface RoomAssignProps {
  readonly rooms: readonly Room[];
  readonly onMove: (personId: string, toRoomId: string) => void;
  readonly testID?: string;
}

interface Rect {
  readonly y: number;
  readonly height: number;
}

const useStyles = makeStyles((th) => ({
  room: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
  },
  picked: { borderWidth: th.ring.focus.widthPt, borderColor: th.ring.focus.color },
}));

function Occupant({
  person,
  picked,
  onPick,
  onDrop,
}: {
  readonly person: RoomOccupant;
  readonly picked: boolean;
  readonly onPick: () => void;
  readonly onDrop: (absoluteY: number) => void;
}) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const drop = (absoluteY: number) => onDrop(absoluteY);
  const pan = Gesture.Pan()
    .onUpdate((event) => {
      'worklet';
      x.value = event.translationX;
      y.value = event.translationY;
    })
    .onEnd((event) => {
      'worklet';
      scheduleOnRN(drop, event.absoluteY);
      x.value = withTiming(0, { duration: tokens.motion.duration.fast });
      y.value = withTiming(0, { duration: tokens.motion.duration.fast });
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
    zIndex: x.value !== 0 || y.value !== 0 ? 1 : 0,
  }));
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style}>
        <PressScale
          onPress={onPick}
          accessibilityLabel={t({ id: 'common.plan.pickPerson', message: `Move ${person.name}` })}
          accessibilityState={{ selected: picked }}
          widthClass="narrow"
        >
          {person.avatar}
        </PressScale>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * Who sleeps where: drag an avatar onto another room, or tap it and then "Move here" on the target
 * room (the same path screen readers use).
 */
export function RoomAssign({ rooms, onMove, testID }: RoomAssignProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const rects = useRef(new Map<string, Rect>());
  const refs = useRef(new Map<string, ComponentRef<typeof View>>());
  const picked = rooms.flatMap((room) => room.occupants).find((person) => person.id === pickedId);

  const measure = (roomId: string) => {
    refs.current.get(roomId)?.measureInWindow((_x, y, _w, height) => {
      rects.current.set(roomId, { y, height });
    });
  };
  const dropAt = (personId: string, fromRoomId: string, absoluteY: number) => {
    for (const [roomId, rect] of rects.current) {
      if (absoluteY >= rect.y && absoluteY <= rect.y + rect.height) {
        if (roomId !== fromRoomId) onMove(personId, roomId);
        return;
      }
    }
  };

  return (
    <Stack gap="10" testID={testID}>
      {rooms.map((room) => {
        const names = room.occupants.map((person) => person.name).join(', ');
        const canReceive = picked !== undefined && !room.occupants.some((p) => p.id === pickedId);
        return (
          <View
            key={room.id}
            ref={(node) => {
              if (node) refs.current.set(room.id, node);
              else refs.current.delete(room.id);
            }}
            onLayout={() => measure(room.id)}
            style={[styles.room, canReceive ? styles.picked : null]}
          >
            <Row gap="12" align="center">
              <Stack
                gap="2"
                flex={1}
                accessible
                accessibilityRole="text"
                accessibilityLabel={[room.name, names, room.tag].filter(Boolean).join(', ')}
              >
                <Text variant="title">{room.name}</Text>
                {room.tag ? (
                  <Text variant="label" color={theme.semantic.text.secondary}>
                    {room.tag}
                  </Text>
                ) : null}
              </Stack>
              <Row gap="6" align="center">
                {room.occupants.map((person) => (
                  <Occupant
                    key={person.id}
                    person={person}
                    picked={person.id === pickedId}
                    onPick={() => setPickedId(person.id === pickedId ? null : person.id)}
                    onDrop={(absoluteY) => dropAt(person.id, room.id, absoluteY)}
                  />
                ))}
              </Row>
              {canReceive ? (
                <ActionPill
                  tone="primary"
                  label={t({ id: 'common.plan.moveHere', message: 'Move here' })}
                  accessibilityLabel={t({
                    id: 'common.plan.movePersonHere',
                    message: `Move ${picked.name} to ${room.name}`,
                  })}
                  onPress={() => {
                    onMove(picked.id, room.id);
                    setPickedId(null);
                  }}
                />
              ) : null}
            </Row>
          </View>
        );
      })}
    </Stack>
  );
}
