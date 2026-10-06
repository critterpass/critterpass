/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';
import { View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { ReactionFloats } from '../chat/ReactionFloats';
import { registerFixture } from '../gallery/registry';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill } from '../plan/ActionPill';
import { Face } from '../plan/plan.fixtures';
import { Text } from '../text/Text';
import { Hatch } from '../textures/hatch';
import { PageDots } from './PageDots';
import { StepTabs } from './StepTabs';
import { StoryPlayer } from './StoryPlayer';

const slide = (eyebrow: string, headline: string) => (
  <View style={{ flex: 1 }}>
    <Hatch />
    <Stack gap="8" padding="20" style={{ position: 'absolute', bottom: 160, start: 0, end: 0 }}>
      <Text variant="eyebrow" color={tokens.color.orange}>
        {eyebrow}
      </Text>
      <Text variant="displayXl">{headline}</Text>
    </Stack>
  </View>
);

function StepsDemo() {
  const [current, setCurrent] = useState(1);
  return (
    <StepTabs
      current={current}
      onSelect={setCurrent}
      steps={[
        { label: 'When', done: true },
        { label: 'Budget', done: current > 1 },
        { label: 'Rooms' },
        { label: 'Must-dos' },
      ]}
    />
  );
}

registerFixture('StoryPlayer', 'proposal trailer', () => (
  <View style={{ height: 640 }}>
    <StoryPlayer
      hint="Tap for the next day · hold to pause"
      header={
        <Row gap="10" align="center" padding="12">
          <Text variant="title">Pon presents</Text>
        </Row>
      }
      overlay={
        <ReactionFloats
          reactions={[
            { id: '1', author: 'Jordan', text: '6AM??', avatar: <Face initial="J" index={4} /> },
            { id: '2', author: 'Alex', text: "I'm in", avatar: <Face initial="A" index={3} /> },
          ]}
        />
      }
      footer={
        <Row gap="8">
          <ActionPill tone="primary" label="I'm in" onPress={() => undefined} />
          <ActionPill label="Maybe" onPress={() => undefined} />
        </Row>
      }
      segments={[
        {
          id: 'day2',
          label: 'Day 2, 06:00. 10,000 gates. Nobody else.',
          caption: 'Worth the alarm. Promise.',
          content: slide('Day 2 · 06:00', '10,000 gates. Nobody else.'),
        },
        {
          id: 'day3',
          label: 'Day 3. Bamboo before the buses.',
          content: slide('Day 3 · 06:30', 'Bamboo before the buses.'),
        },
        { id: 'day4', label: 'Day 4. Nara deer.', content: slide('Day 4', 'Deer with manners.') },
      ]}
    />
  </View>
));
// Held, as while a reply panel is open: the bars stand still, so the tap and hold gestures can be
// driven one step at a time (e2e/gallery/gestures.yaml).
registerFixture('StoryPlayer', 'held for a reply', () => (
  <View style={{ height: 480 }}>
    <StoryPlayer
      held
      hint="Tap for the next day · hold to pause"
      segments={[
        {
          id: 'day2',
          label: 'Day 2, 06:00. 10,000 gates. Nobody else.',
          content: slide('Day 2 · 06:00', '10,000 gates. Nobody else.'),
        },
        {
          id: 'day3',
          label: 'Day 3. Bamboo before the buses.',
          content: slide('Day 3 · 06:30', 'Bamboo before the buses.'),
        },
      ]}
    />
  </View>
));
registerFixture('StepTabs', 'kyoto setup', () => <StepsDemo />);
registerFixture('PageDots', 'page three of four', () => <PageDots page={3} total={4} />);
