/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { InlineAction } from '../buttons/InlineAction';
import { PillButton } from '../buttons/PillButton';
import { Card } from '../cards/Card';
import { registerFixture } from '../gallery/registry';
import { Text } from '../text/Text';
import { KeyboardFooter } from './KeyboardFooter';
import { KeyboardScrollView } from './KeyboardScrollView';
import { Stack } from './Stack';

const STEPS = [
  'Flights land around 14:00, so the first night stays close to the airport.',
  'Day two is the temple loop: Tirta Empul early, before the tour buses.',
  'Rooms: two doubles and a twin, split by who snores.',
  'Budget sits at Rp 4.2M each, flights not included.',
  'Must-dos so far: sunrise at Batur, one cooking class, a long lunch in Ubud.',
  'The villa holds the dates until Friday.',
];

/** A long step screen: the cards run under the sticky footer and fade into the page there. */
function LongStep() {
  return (
    <View style={{ height: 520, backgroundColor: tokens.semantic.bg.base }}>
      <KeyboardScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: tokens.space['16'], gap: tokens.space['12'] }}
      >
        {STEPS.map((step) => (
          <Card key={step}>
            <Text variant="body">{step}</Text>
          </Card>
        ))}
      </KeyboardScrollView>
      <KeyboardFooter style={{ alignItems: 'center' }}>
        <PillButton label="Lock Apr 2–9" onPress={() => undefined} />
        <InlineAction label="Not yet" onPress={() => undefined} />
      </KeyboardFooter>
    </View>
  );
}

registerFixture('KeyboardFooter', 'long step under a sticky footer', () => (
  <Stack>
    <LongStep />
  </Stack>
));
