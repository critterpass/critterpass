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
  // Shows which row a tap opened, so a tap and a drag on the same row are told apart.
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <Stack gap="8">
      {days.map((day, index) => (
        <DayRow
          key={day.title}
          dayNumber={index + 1}
          weekday={day.w}
          title={day.title}
          summary={day.sub}
          onPress={() => setOpened(day.title)}
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
      <Text variant="bodySm" testID="day-row-opened">
        {opened === null ? 'Tap a day to open it' : `Opened ${opened}`}
      </Text>
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
