/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';

import { registerFixture } from '../gallery/registry';
import { Icon } from '../icons/Icon';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Sticker } from '../sticker/Sticker';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';
import { ActionCard } from './ActionCard';
import { Card } from './Card';
import { CountdownCard } from './CountdownCard';
import { CrewCard } from './CrewCard';
import { DashedAddCard } from './DashedAddCard';
import { HeroPanel } from './HeroPanel';
import { ListCard } from './ListCard';
import { SuggestionCard } from './SuggestionCard';
import { TileGrid } from './TileGrid';

const noop = () => undefined;

const useStyles = makeStyles((t) => ({
  chip: {
    backgroundColor: t.semantic.bg.base,
    borderRadius: t.radius.sm,
    paddingHorizontal: t.space['10'],
    paddingVertical: t.space['6'],
  },
  action: {
    backgroundColor: t.semantic.bg.control,
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space['14'],
    justifyContent: 'center',
  },
}));

function Chip({ children }: { readonly children: string }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack style={styles.chip}>
      <Text variant="label" color={theme.semantic.text.primary}>
        {children}
      </Text>
    </Stack>
  );
}

function SampleAction({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <PressScale
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.action}
      widthClass="narrow"
    >
      <Text variant="buttonSm">{label}</Text>
    </PressScale>
  );
}

function SlideOffDemo() {
  const [handled, setHandled] = useState(false);
  const [gone, setGone] = useState(false);
  if (gone)
    return (
      <DashedAddCard
        label="Reset"
        onPress={() => {
          setGone(false);
          setHandled(false);
        }}
      />
    );
  return (
    <ActionCard
      title="Mika wants to add a night in Ubud"
      body="Approve to add it to the plan."
      leading={<Icon name="bed" size={32} decorative />}
      actions={<SampleAction label="Approve" onPress={() => setHandled(true)} />}
      handled={handled}
      onDismissed={() => setGone(true)}
    />
  );
}

const guide = <Sticker kind="gecko" name="Tokek" size={96} pose="wave" />;

registerFixture('Card', 'raised', () => (
  <Card>
    <Text variant="title">A plain raised card</Text>
  </Card>
));
registerFixture('Card', 'accent + halftone', () => (
  <Card tone="pink" halftone>
    <Text variant="h3">Storm warning</Text>
  </Card>
));
registerFixture('Card', 'paper', () => (
  <Card tone="paper">
    <Text variant="title">Receipt scanned</Text>
  </Card>
));
registerFixture('ListCard', 'default', () => (
  <Stack gap="8">
    <ListCard
      title="Hotel Tugu"
      subtitle="Check-in 3 pm · 4 nights"
      leading={<Icon name="bed" size={32} decorative />}
      onPress={noop}
    />
    <ListCard title="Flight GA 841" subtitle="SIN → DPS" trailing={<Chip>Booked</Chip>} />
  </Stack>
));
registerFixture('TileGrid', 'hub 2×2', () => (
  <TileGrid
    tiles={[
      {
        key: 'plan',
        title: 'Plan',
        caption: '4 days drafted',
        icon: 'cal',
        tone: 'yellow',
        onPress: noop,
      },
      { key: 'money', title: 'Money', caption: 'You owe $42', icon: 'wallet', onPress: noop },
      { key: 'stay', title: 'Stays', caption: '2 booked', icon: 'bed', onPress: noop },
      { key: 'chat', title: 'Chat', caption: '5 new', icon: 'chat', onPress: noop },
    ]}
  />
));
registerFixture('TileGrid', 'stats (3 columns, ragged)', () => (
  <TileGrid
    columns={3}
    tiles={[
      { key: 'km', value: '412', title: 'Kilometres' },
      { key: 'critters', value: '12', title: 'Critters' },
      { key: 'stamps', value: '3', title: 'Stamps' },
      { key: 'photos', value: '208', title: 'Photos' },
    ]}
  />
));
registerFixture('HeroPanel', 'yellow with sticker', () => (
  <HeroPanel sticker={guide}>
    <Text variant="eyebrow">Trip hub</Text>
    <Text variant="h1">Bali</Text>
  </HeroPanel>
));
registerFixture('CountdownCard', 'next trip', () => (
  <CountdownCard
    eyebrow="Next up · Oct 12"
    title="Bali"
    sticker={guide}
    meta={
      <>
        <Chip>17d 05:26:47</Chip>
        <Chip>Plan 80%</Chip>
      </>
    }
    metaLabel="17 days to go, plan 80 percent done"
    onPress={noop}
  />
));
registerFixture('CountdownCard', 'long destination', () => (
  <CountdownCard eyebrow="Next up · Mar 30" title="Reykjavík and the Golden Circle" tone="blue" />
));
registerFixture('ActionCard', 'slides off when handled', () => <SlideOffDemo />);
registerFixture('SuggestionCard', 'guide pick with actions', () => (
  <SuggestionCard
    eyebrow="Tokek's pick"
    title="Sunrise at Mount Batur"
    reason="Leave by 2 am, worth every yawn."
    art={<Icon name="volcano" size={40} decorative />}
    actions={<SampleAction label="Add to plan" onPress={noop} />}
  />
));
registerFixture('SuggestionCard', 'tappable', () => (
  <SuggestionCard title="Warung Babi Guling" reason="Two streets from your stay" onPress={noop} />
));
registerFixture('DashedAddCard', 'card', () => (
  <DashedAddCard label="Add a booking" onPress={noop} />
));
registerFixture('DashedAddCard', 'circle pitch', () => (
  <DashedAddCard label="Pitch a place" shape="circle" size={110} onPress={noop} />
));
registerFixture('CrewCard', 'default', () => (
  <CrewCard
    name="The Bali Six"
    detail="Bali · Oct 12–19"
    membersLabel="6 members"
    status={<Chip>Planning</Chip>}
    statusLabel="Planning"
    onPress={noop}
  />
));
