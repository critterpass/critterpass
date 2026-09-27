/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';
import { View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { registerFixture } from '../gallery/registry';
import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Face } from '../plan/plan.fixtures';
import { Sticker } from '../sticker/Sticker';
import { Text } from '../text/Text';
import { Hatch } from '../textures/hatch';
import { IdeaVoteBox } from './IdeaVoteBox';
import { LiveOptionCards } from './LiveOptionCards';
import { MoodPicker } from './MoodPicker';
import { RateStack } from './RateStack';
import { ResultTally } from './ResultTally';
import { SplitShowdown } from './SplitShowdown';
import { SwipeStack } from './SwipeStack';
import type { DeckCard } from './SwipeStack';
import { VoteBoard } from './VoteBoard';

const { color } = tokens;

function PlaceCard({ title, sub }: { readonly title: string; readonly sub: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: tokens.semantic.bg.raised }}>
      <View style={{ flex: 1 }}>
        <Hatch />
      </View>
      <Stack gap="4" padding="16">
        <Text variant="h2">{title}</Text>
        <Text variant="bodySm">{sub}</Text>
      </Stack>
    </View>
  );
}

const PLACES: readonly DeckCard[] = [
  {
    id: 'tirta',
    label: 'Tirta Empul, water temple',
    content: <PlaceCard title="Tirta Empul" sub="Water temple · 45 min from the villa" />,
  },
  {
    id: 'tegal',
    label: 'Tegallalang, rice terraces',
    content: <PlaceCard title="Tegallalang" sub="Rice terraces · 20 min" />,
  },
  {
    id: 'goa',
    label: 'Goa Gajah, elephant cave',
    content: <PlaceCard title="Goa Gajah" sub="Elephant cave · 15 min" />,
  },
];

function SwipeDemo() {
  const [cards, setCards] = useState(PLACES);
  return (
    <SwipeStack
      cards={cards}
      progressLabel={`${PLACES.length - cards.length}/${PLACES.length} · 1 match`}
      onAnswer={(id) => setCards((list) => list.filter((card) => card.id !== id))}
      empty={<Text variant="title">All caught up</Text>}
    />
  );
}

function RateDemo() {
  const [cards, setCards] = useState(PLACES);
  return (
    <RateStack
      cards={cards}
      progressLabel={`${PLACES.length - cards.length + 1} of ${PLACES.length}`}
      onRate={(id) => setCards((list) => list.filter((card) => card.id !== id))}
      empty={<Text variant="title">All rated</Text>}
    />
  );
}

function VoteDemo() {
  const [mine, setMine] = useState<string | null>('kyoto');
  return (
    <SplitShowdown
      onVote={setMine}
      sides={[
        {
          id: 'kyoto',
          name: 'Kyoto',
          color: color.orange,
          votes: mine === 'kyoto' ? 3 : 2,
          mine: mine === 'kyoto',
          sticker: <Sticker kind="tanuki" name="Pon" size={140} />,
          voters: (
            <Row gap="2">
              <Face initial="M" index={0} />
              <Face initial="J" index={4} />
            </Row>
          ),
        },
        {
          id: 'lisbon',
          name: 'Lisbon',
          color: color.blue,
          votes: mine === 'lisbon' ? 2 : 1,
          mine: mine === 'lisbon',
          sticker: <Sticker kind="sardine" name="Sardi" size={140} />,
          voters: <Face initial="A" index={3} />,
        },
      ]}
    />
  );
}

function IdeaDemo() {
  const [voted, setVoted] = useState(false);
  return (
    <Row gap="12" align="center">
      <IdeaVoteBox
        count={voted ? 413 : 412}
        voted={voted}
        onToggle={() => setVoted((v) => !v)}
        ideaTitle="Packing lists per crew"
      />
      <Text variant="title">Packing lists per crew</Text>
    </Row>
  );
}

function MoodDemo() {
  const [mood, setMood] = useState<number | null>(4);
  const kinds = ['axolotl', 'puffin', 'sardine', 'gecko', 'tanuki'] as const;
  const labels = ['Grr', 'Meh', 'Okay', 'Good', 'Love it'];
  return (
    <MoodPicker
      label="How's it going?"
      value={mood}
      onChange={setMood}
      options={kinds.map((kind, index) => ({
        value: index + 1,
        label: labels[index] ?? '',
        sticker: <Sticker kind={kind} name={labels[index] ?? ''} size={40} />,
      }))}
    />
  );
}

registerFixture('VoteBoard', 'vote open', () => (
  <VoteBoard
    title="Where next?"
    status="Vote open · 4 of 6 in"
    onVote={() => undefined}
    options={[
      {
        id: 'kyoto',
        name: 'Kyoto',
        votes: 3,
        mine: true,
        color: color.orange,
        sticker: <Sticker kind="tanuki" name="Pon" size={72} />,
        voters: (
          <Row gap="2">
            <Face initial="M" index={0} />
            <Face initial="J" index={4} />
          </Row>
        ),
      },
      {
        id: 'lisbon',
        name: 'Lisbon',
        votes: 1,
        color: color.green.base,
        sticker: <Sticker kind="sardine" name="Sardi" size={72} />,
      },
      {
        id: 'reykjavik',
        name: 'Reykjavík',
        votes: 0,
        color: color.blue,
        sticker: <Sticker kind="puffin" name="Lundi" size={72} />,
      },
    ]}
  />
));
registerFixture('SplitShowdown', 'final vote', () => <VoteDemo />);
registerFixture('ResultTally', 'Kyoto wins', () => (
  <ResultTally
    headline="Kyoto wins 4–2"
    rows={[
      { id: 'kyoto', name: 'Kyoto', votes: 4, color: color.orange, winner: true },
      { id: 'lisbon', name: 'Lisbon', votes: 2, color: color.green.base },
    ]}
  />
));
registerFixture('SwipeStack', 'swipe together', () => <SwipeDemo />);
registerFixture('RateStack', 'rate the trip', () => <RateDemo />);
registerFixture('LiveOptionCards', 'boat day', () => (
  <LiveOptionCards
    onVote={() => undefined}
    presence={[{ id: 'alex', name: 'Alex', color: color.green.base, optionId: 'penida' }]}
    options={[
      {
        id: 'penida',
        title: 'Nusa Penida',
        detail: '45 min boat · $38',
        votes: 4,
        media: <Hatch />,
      },
      {
        id: 'gili',
        title: 'Gili T',
        detail: '2h 30m boat · $52',
        votes: 2,
        mine: true,
        media: <Hatch />,
      },
    ]}
  />
));
registerFixture('IdeaVoteBox', 'toggle', () => <IdeaDemo />);
registerFixture('MoodPicker', 'five critters', () => <MoodDemo />);
registerFixture('MoodPicker', 'doodle fallback', () => (
  <MoodPicker
    label="How was today?"
    value={null}
    onChange={() => undefined}
    options={[
      { value: 'rain', label: 'Rough', sticker: <Icon name="rain" decorative /> },
      { value: 'sun', label: 'Great', sticker: <Icon name="sun" decorative /> },
    ]}
  />
));
