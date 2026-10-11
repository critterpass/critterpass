/**
 * Who sleeps where in the premium look (undesigned for setup; the wallet's rooms carry the booked
 * version): one card per stay with its nights, each room as a row ("Room 2", the faces in it, the
 * guide's grouping as a tag), people who joined later waiting above, and a later stay mirroring
 * the first unless it is set separately. The organiser taps a face, then a room: a full room
 * refuses with the warning haptic and a line why; anything else is one new layout for `onMove`.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { crewColour } from '@/features/vote';
import { useLocale } from '@/lib/i18n/use-locale';
import { impact } from '@/motion';
import {
  Avatar,
  Card,
  PressableScale,
  StatusTag,
  Text,
  Toggle,
  usePremiumTheme,
} from '@/ui/premium';

import { dayRange } from '../../data/date-range';
import type { SetupMember } from '../../data/setup-trip';
import { stayName, traitName } from '../../rooms/copy';
import { moveGuest, stayDates, unplaced, type PlanStay, type RoomsPlan } from '../../rooms/model';
import type { RoomsActions } from '../../rooms/rooms-view';

export function PremiumRoomsPlan(props: {
  readonly plan: RoomsPlan;
  readonly members: readonly SetupMember[];
  readonly me: string;
  readonly tripStart: string | null;
  readonly editable: boolean;
  readonly actions: RoomsActions;
}) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { plan, editable } = props;
  const people = new Map(props.members.map((member) => [member.uid, member]));
  const [selected, setSelected] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const mirrored = (index: number) => index > 0 && plan.samePairsAllStays;
  const firstStay = plan.stays.find((_, index) => !mirrored(index));
  const waiting =
    firstStay === undefined
      ? []
      : unplaced(
          firstStay,
          props.members.map((m) => m.uid),
        );
  const canMove = editable && !plan.locked;

  const moveHere = (stay: PlanStay, roomKey: string) => {
    if (selected === null) return;
    const result = moveGuest(stay, selected, roomKey);
    setSelected(null);
    if (result.kind === 'full') {
      impact('warning');
      setFull(true);
      return;
    }
    setFull(false);
    if (result.kind === 'moved') {
      impact('snap');
      props.actions.onMove(result.stay, { uid: selected, roomKey });
    }
  };
  const face = (uid: string) => {
    const person = people.get(uid);
    const name = person?.name ?? '';
    const on = selected === uid;
    const avatar = (
      <Avatar
        name={name}
        color={crewColour(person?.joinIndex ?? 0)}
        size={34}
        ringed={on || (!editable && uid === props.me)}
      />
    );
    if (!canMove) return <View key={uid}>{avatar}</View>;
    return (
      <PressableScale
        key={uid}
        onPress={() => setSelected((current) => (current === uid ? null : uid))}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={t({ id: 'setup.premium.rooms.pick', message: `Move ${name}` })}
        testID={`setup-rooms-face-${uid}`}
        style={{ transform: [{ translateY: on ? -4 : 0 }] }}
      >
        {avatar}
      </PressableScale>
    );
  };

  return (
    <View style={{ gap: theme.space.gap12 }}>
      {waiting.length === 0 ? null : (
        <View
          testID="setup-rooms-unplaced"
          style={{
            borderRadius: theme.radius.card,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: theme.color.fieldBorder,
            padding: theme.space.gap12,
            gap: theme.space.gap8,
          }}
        >
          <Text variant="caption" tone="muted">
            {editable
              ? t({
                  id: 'setup.premium.rooms.unplaced',
                  message: 'Joined after the rooms were made. Tap them, then a room.',
                })
              : t({ id: 'setup.rooms.unplaced.member', message: 'Not in a room yet.' })}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.space.gap8 }}>{waiting.map(face)}</View>
        </View>
      )}
      {full ? (
        <Text variant="caption" color={theme.color.status.voteOpen.text} testID="setup-rooms-full">
          {t({
            id: 'setup.rooms.full',
            message: 'That room is full. Move someone out of it first.',
          })}
        </Text>
      ) : null}
      {plan.stays.map((stay, index) => {
        const dates = stayDates(plan, index, props.tripStart);
        const nights = stay.nights;
        const range = dates === null ? null : dayRange(locale, dates.from, dates.to);
        const first = stayName(plan.stays[0]?.type ?? '').toLocaleLowerCase(locale);
        const rooms = stay.rooms.length;
        return (
          <Card key={stay.key} padded testID={`setup-rooms-stay-${stay.key}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap8 }}>
              <Text variant="headline" style={{ flex: 1 }} accessibilityRole="header">
                {stayName(stay.type)}
              </Text>
              <Text variant="caption" tone="muted">
                {range === null
                  ? t({ id: 'setup.rooms.nights', message: `${nights} nights` })
                  : t({ id: 'setup.rooms.datesNights', message: `${range} · ${nights} nights` })}
              </Text>
            </View>
            {mirrored(index) ? (
              <Text variant="body" tone="muted" testID={`setup-rooms-mirrored-${stay.key}`}>
                {t({
                  id: 'setup.rooms.samePairs',
                  message: `${rooms} rooms. Same pairs as the ${first}.`,
                })}
              </Text>
            ) : (
              <View style={{ marginTop: theme.space.gap8 }}>
                {stay.rooms.map((room, roomIndex) => {
                  const n = roomIndex + 1;
                  const title = t({ id: 'setup.rooms.room', message: `Room ${n}` });
                  const target = canMove && selected !== null && !room.occupants.includes(selected);
                  const mine = !editable && room.occupants.includes(props.me);
                  return (
                    <PressableScale
                      key={room.key}
                      onPress={() => moveHere(stay, room.key)}
                      disabled={!target}
                      accessibilityRole={target ? 'button' : 'text'}
                      accessibilityLabel={
                        target
                          ? t({
                              id: 'setup.premium.rooms.moveHere',
                              message: `Move here: ${title}`,
                            })
                          : title
                      }
                      testID={`setup-rooms-room-${room.key}`}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.space.gap10,
                        minHeight: 52,
                        paddingHorizontal: theme.space.gap8,
                        borderRadius: theme.radius.banner,
                        borderTopWidth: roomIndex === 0 ? 0 : 0.5,
                        borderColor: theme.color.hairline,
                        backgroundColor:
                          target || mine ? theme.color.status.rain.bg : 'transparent',
                      }}
                    >
                      <Text variant="rowTextStrong" style={{ width: 62 }}>
                        {title}
                      </Text>
                      <View style={{ flex: 1, flexDirection: 'row', gap: theme.space.gap6 }}>
                        {room.occupants.map(face)}
                      </View>
                      {room.trait === null ? null : (
                        <StatusTag tone="maybe" label={traitName(room.trait)} />
                      )}
                    </PressableScale>
                  );
                })}
              </View>
            )}
            {index > 0 && editable ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.space.gap12,
                  marginTop: theme.space.gap8,
                }}
              >
                <Text variant="caption" style={{ flex: 1 }}>
                  {t({ id: 'setup.rooms.separate', message: 'Set these rooms separately' })}
                </Text>
                <Toggle
                  value={!mirrored(index)}
                  onChange={(separate) => props.actions.onSeparate(stay.key, separate)}
                  accessibilityLabel={t({
                    id: 'setup.rooms.separate',
                    message: 'Set these rooms separately',
                  })}
                  testID={`setup-rooms-separate-${stay.key}`}
                />
              </View>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}
