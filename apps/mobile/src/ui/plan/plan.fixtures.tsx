/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';
import { View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { registerFixture } from '../gallery/registry';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { sizeToken } from '../theme';
import { ActionPill } from './ActionPill';
import { DayRow } from './DayRow';
import { DayTimeline } from './DayTimeline';
import type { TimelineBlock } from './DayTimeline';
import { DiffRow } from './DiffRow';
import type { DiffDecision } from './DiffRow';
import { MustDoRow } from './MustDoRow';
import { RoomAssign } from './RoomAssign';
import type { Room } from './RoomAssign';

const { color, member } = tokens;
const size = sizeToken(tokens.size.avatar, 'lg');

/** Gallery-only initial disc standing in for the people family's Avatar. */
export function Face({ initial, index }: { readonly initial: string; readonly index: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: member.colors[index % member.colors.length],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant="label" color={tokens.semantic.text.onAccent}>
        {initial}
      </Text>
    </View>
  );
}

function DaysDemo() {
  const [days, setDays] = useState([
    { n: 1, w: 'Mon', title: 'Arrive + pool', sub: 'Driver 11:40 · villa check-in 15:00' },
    { n: 2, w: 'Tue', title: 'Ubud centre', sub: 'Monkey Forest · cooking class' },
    { n: 3, w: 'Wed', title: 'Slow Ubud', sub: 'Terraces 7am · spa · ridge walk' },
  ]);
  return (
    <Stack gap="8">
      {days.map((day, index) => (
        <DayRow
          key={day.title}
          dayNumber={index + 1}
          weekday={day.w}
          title={day.title}
          summary={day.sub}
          reorder={{
            index,
            count: days.length,
            rowHeight: 80,
            onReorder: (from, to) =>
              setDays((list) => {
                const next = [...list];
                const [moved] = next.splice(from, 1);
                if (moved) next.splice(to, 0, moved);
                return next;
              }),
          }}
        />
      ))}
    </Stack>
  );
}

function TimelineDemo() {
  const [blocks, setBlocks] = useState<readonly TimelineBlock[]>([
    {
      id: 'terraces',
      title: 'Jatiluwih terraces',
      detail: '07:00–11:00 · driver Made',
      start: 420,
      end: 660,
      color: color.blue,
    },
    {
      id: 'lunch',
      title: 'Lunch · Biah Biah',
      detail: '4 of 6 voted',
      start: 690,
      end: 750,
      color: color.yellow,
      lane: 'start',
    },
    {
      id: 'walk-old',
      title: 'Ridge walk',
      start: 840,
      end: 900,
      color: color.ink[600],
      struck: true,
    },
    {
      id: 'spa',
      title: 'Karsa spa',
      detail: 'Maya, Rin',
      start: 930,
      end: 1050,
      color: color.pink,
      lane: 'start',
    },
    {
      id: 'dinner',
      title: 'Dinner · Locavore NXT',
      detail: '19:30 · table held',
      start: 1080,
      end: 1140,
      color: color.paper.base,
    },
  ]);
  return (
    <DayTimeline
      blocks={blocks}
      rain={{ start: 780, end: 900, label: 'Rain' }}
      ghost={{
        title: 'Ridge walk',
        detail: '17:00 · golden hour',
        start: 1020,
        end: 1080,
        color: color.yellow,
        lane: 'end',
        onAccept: () => undefined,
      }}
      onMove={(id, start) =>
        setBlocks((list) =>
          list.map((block) =>
            block.id === id ? { ...block, start, end: start + block.end - block.start } : block,
          ),
        )
      }
    />
  );
}

function DiffDemo() {
  const [decision, setDecision] = useState<DiffDecision>('pending');
  return (
    <DiffRow
      before="14:00 Ridge walk"
      after="17:00 Ridge walk"
      reason="Rain clears by 3. Golden hour."
      people={
        <Row gap="4">
          <Face initial="M" index={0} />
          <Face initial="A" index={1} />
        </Row>
      }
      decision={decision}
      onKeep={() => setDecision('kept')}
      onReject={() => setDecision('rejected')}
    />
  );
}

function RoomsDemo() {
  const [rooms, setRooms] = useState<readonly Room[]>([
    {
      id: 'r1',
      name: 'Room 1',
      tag: 'Light sleepers',
      occupants: [
        { id: 'm', name: 'Maya', avatar: <Face initial="M" index={0} /> },
        { id: 'r', name: 'Rin', avatar: <Face initial="R" index={1} /> },
      ],
    },
    {
      id: 'r2',
      name: 'Room 2',
      tag: 'Early risers',
      occupants: [
        { id: 'w', name: 'Winston', avatar: <Face initial="W" index={2} /> },
        { id: 'a', name: 'Alex', avatar: <Face initial="A" index={3} /> },
      ],
    },
    {
      id: 'r3',
      name: 'Room 3',
      tag: 'Night owls',
      occupants: [{ id: 'j', name: 'Jordan', avatar: <Face initial="J" index={4} /> }],
    },
  ]);
  return (
    <RoomAssign
      rooms={rooms}
      onMove={(personId, toRoomId) =>
        setRooms((list) => {
          const person = list.flatMap((room) => room.occupants).find((p) => p.id === personId);
          if (!person) return list;
          return list.map((room) => ({
            ...room,
            occupants:
              room.id === toRoomId
                ? [...room.occupants, person]
                : room.occupants.filter((p) => p.id !== personId),
          }));
        })
      }
    />
  );
}

registerFixture('ActionPill', 'tones', () => (
  <Row gap="8" wrap>
    <ActionPill label="Move it" tone="primary" onPress={() => undefined} />
    <ActionPill label="Nudge" onPress={() => undefined} />
    <ActionPill label="Undo" tone="outline" onPress={() => undefined} />
    <ActionPill label="Paid" tone="success" selected />
    <ActionPill label="Needs signal" disabled />
  </Row>
));
registerFixture('DayRow', 'reorderable', () => <DaysDemo />);
registerFixture('DayRow', 'booked', () => (
  <DayRow
    dayNumber={4}
    weekday="Thu"
    title="Batur sunrise"
    summary="Pickup 03:30 · hot springs"
    statusLabel="Booked"
    color={color.orange}
    onPress={() => undefined}
  />
));
registerFixture('DayTimeline', 'planning mode', () => <TimelineDemo />);
registerFixture('DiffRow', 'toggle', () => <DiffDemo />);
registerFixture('DiffRow', 'rejected', () => (
  <DiffRow
    before="19:30 Locavore NXT"
    after="20:30 Locavore NXT"
    reason="Only needed if the walk runs late."
    decision="rejected"
  />
));
registerFixture('MustDoRow', 'checked', () => (
  <MustDoRow
    owner={<Face initial="M" index={0} />}
    ownerName="Maya"
    title="Tea ceremony"
    detail="Camellia, Gion"
    state="checked"
  />
));
registerFixture('MustDoRow', 'entered', () => (
  <MustDoRow
    owner={<Face initial="A" index={3} />}
    ownerName="Alex"
    title="Nintendo Museum"
    detail="Uji · ticket lottery"
    state="checked"
    tag="Entered"
  />
));
registerFixture('MustDoRow', 'flagged', () => (
  <MustDoRow
    owner={<Face initial="J" index={4} />}
    ownerName="Jordan"
    title="Vegetarian kaiseki"
    detail="Shigetsu"
    state="flagged"
    tag="Clashes with day 3"
  />
));
registerFixture('MustDoRow', 'typing', () => (
  <MustDoRow owner={<Face initial="D" index={5} />} ownerName="Dev" state="typing" />
));
registerFixture('RoomAssign', 'ryokan', () => <RoomsDemo />);
