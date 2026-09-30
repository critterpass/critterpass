/**
 * The rooms plan's cards and who-goes-where interaction: drag an avatar onto a room (found from
 * each room's measured rect), or tap an avatar then a room. A full room refuses the move with a
 * shake, the warning haptic and a line saying why; everything else becomes one new stay layout
 * handed to `onMove`. People who joined after the rooms were made wait in a row of their own.
 */
import { t } from '@lingui/core/macro';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { impact } from '@/motion';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { DraggableAvatar } from './draggable-avatar';
import { moveGuest, stayDates, unplaced, type PlanStay, type RoomsPlan } from './model';
import type { RoomRowPerson } from './room-row';
import { StayCard } from './stay-card';

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const useStyles = makeStyles((th) => ({
  waiting: {
    borderRadius: th.radius.lg,
    borderWidth: th.space['2'],
    borderStyle: 'dashed',
    padding: th.space['12'],
    gap: th.space['8'],
  },
}));

export interface RoomsPlanProps {
  readonly plan: RoomsPlan;
  readonly people: ReadonlyMap<string, RoomRowPerson>;
  readonly memberIds: readonly string[];
  readonly me: string;
  readonly tripStart: string | null;
  readonly editable: boolean;
  readonly onMove: (stay: PlanStay, moved: { uid: string; roomKey: string }) => void;
  readonly onSeparate: (stayKey: string, separate: boolean) => void;
  /** A refused drop shows from the start (developer scenes). */
  readonly initialReject?: { readonly stayKey: string; readonly roomKey: string } | undefined;
}

export function RoomsPlanCards({
  plan,
  people,
  memberIds,
  me,
  tripStart,
  editable,
  onMove,
  onSeparate,
  initialReject,
}: RoomsPlanProps) {
  const styles = useStyles();
  const theme = useTheme();
  const rects = useRef(new Map<string, Rect>());
  const [selected, setSelected] = useState<string | null>(null);
  const [rejected, setRejected] = useState<{
    stayKey: string;
    roomKey: string;
    count: number;
  } | null>(initialReject === undefined ? null : { ...initialReject, count: 1 });
  const firstType = plan.stays[0]?.type ?? '';
  const mirroredStay = (index: number) => index > 0 && plan.samePairsAllStays;
  const editableStays = plan.stays.filter((_, index) => !mirroredStay(index));

  const tryMove = (stayKey: string, uid: string, roomKey: string) => {
    const stay = plan.stays.find((candidate) => candidate.key === stayKey);
    if (stay === undefined) return;
    const result = moveGuest(stay, uid, roomKey);
    if (result.kind === 'full') {
      impact('warning');
      setRejected((previous) => ({ stayKey, roomKey, count: (previous?.count ?? 0) + 1 }));
      return;
    }
    setRejected(null);
    if (result.kind === 'moved') {
      impact('snap');
      onMove(result.stay, { uid, roomKey });
    }
  };
  const drop = (stayKey: string, uid: string, x: number, y: number) => {
    for (const [key, rect] of rects.current) {
      const [rectStay, roomKey] = key.split('|');
      if (rectStay !== stayKey || roomKey === undefined) continue;
      if (x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height) {
        tryMove(stayKey, uid, roomKey);
        return;
      }
    }
  };
  const select = (uid: string) => setSelected((current) => (current === uid ? null : uid));
  const moveHere = (stayKey: string, roomKey: string) => {
    if (selected === null) return;
    tryMove(stayKey, selected, roomKey);
    setSelected(null);
  };
  const waitingStay = editableStays[0];
  const waiting = waitingStay === undefined ? [] : unplaced(waitingStay, memberIds);
  const fullName =
    rejected === null
      ? null
      : t({
          id: 'setup.rooms.full',
          message: `That room is full. Move someone out of it first.`,
        });

  return (
    <Stack gap="12">
      {plan.stays.map((stay, index) => (
        <StayCard
          key={stay.key}
          index={index}
          stay={stay}
          firstStayType={firstType}
          dates={stayDates(plan, index, tripStart)}
          mirrored={mirroredStay(index)}
          people={people}
          me={me}
          editable={editable && !plan.locked}
          selectedUid={selected}
          rejected={rejected?.stayKey === stay.key ? rejected : null}
          freeCancelUntil={plan.bookingId !== null ? plan.freeCancelUntil : null}
          onSelect={select}
          onMoveHere={moveHere}
          onLift={() => impact('peel')}
          onDrop={drop}
          onMeasure={(stayKey, roomKey, rect) => rects.current.set(`${stayKey}|${roomKey}`, rect)}
          onSeparate={
            editable && index > 0 ? (separate) => onSeparate(stay.key, separate) : undefined
          }
        />
      ))}
      {waiting.length > 0 && waitingStay !== undefined ? (
        <View
          style={[styles.waiting, { borderColor: theme.semantic.border.decorative }]}
          testID="setup-rooms-unplaced"
        >
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {editable
              ? t({
                  id: 'setup.rooms.unplaced.organiser',
                  message: 'Joined after the rooms were made. Drop them into a room.',
                })
              : t({ id: 'setup.rooms.unplaced.member', message: 'Not in a room yet.' })}
          </Text>
          <Row gap="8" align="center">
            {waiting.map((uid) => (
              <DraggableAvatar
                key={uid}
                uid={uid}
                name={people.get(uid)?.name ?? ''}
                joinIndex={people.get(uid)?.joinIndex ?? 0}
                selected={uid === selected}
                draggable={editable}
                onSelect={select}
                onLift={() => impact('peel')}
                onDrop={(dropped, x, y) => drop(waitingStay.key, dropped, x, y)}
              />
            ))}
          </Row>
        </View>
      ) : null}
      {fullName === null ? null : (
        <Text variant="bodySm" color={theme.semantic.state.warning} testID="setup-rooms-full">
          {fullName}
        </Text>
      )}
    </Stack>
  );
}
