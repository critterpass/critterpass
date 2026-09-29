/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';
import { View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { registerFixture } from '../gallery/registry';
import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill } from '../plan/ActionPill';
import { Face } from '../plan/plan.fixtures';
import { Text } from '../text/Text';
import { Hatch } from '../textures/hatch';
import { AttachmentThumb } from './AttachmentThumb';
import { ChatMessage } from './ChatMessage';
import { ChatRichCard } from './ChatRichCard';
import { Composer } from './Composer';
import { FormatPicker } from './FormatPicker';
import { ReactionFloats } from './ReactionFloats';
import type { Reaction } from './ReactionFloats';

const noop = () => undefined;
const guide = <Icon name="spark" size={28} decorative />;

function ComposerDemo() {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  return (
    <Composer
      value={text}
      onChangeText={setText}
      onSend={() => setText('')}
      placeholder="Message, or @tokek"
      onAttach={noop}
      recording={recording}
      onMicTap={() => setRecording((r) => !r)}
      onHoldStart={() => setRecording(true)}
      onHoldEnd={() => setRecording(false)}
    />
  );
}

function PollDemo() {
  const [mine, setMine] = useState<string | null>('yes');
  const options = [
    { id: 'yes', label: 'Yes', base: 2 },
    { id: 'maybe', label: 'Maybe', base: 1 },
    { id: 'no', label: 'No', base: 0 },
  ];
  return (
    <ChatRichCard
      kind="poll"
      title="Spa on day 3?"
      byline="Maya's poll"
      onVote={setMine}
      options={options.map((o) => ({
        id: o.id,
        label: o.label,
        votes: o.base + (mine === o.id ? 1 : 0),
        mine: mine === o.id,
      }))}
    />
  );
}

function FloatsDemo() {
  const [reactions, setReactions] = useState<readonly Reaction[]>([
    { id: '1', author: 'Jordan', text: '6AM??', avatar: <Face initial="J" index={4} /> },
  ]);
  return (
    <Stack gap="12">
      <ReactionFloats reactions={reactions} />
      <ActionPill
        label="React"
        onPress={() =>
          setReactions((list) => [
            ...list,
            {
              id: String(list.length + 1),
              author: 'Alex',
              text: "I'm in",
              avatar: <Face initial="A" index={3} />,
            },
          ])
        }
      />
    </Stack>
  );
}

function FormatDemo() {
  const [format, setFormat] = useState<'trailer' | 'poster' | 'postcard'>('trailer');
  const thumb = (label: string) => (
    <View style={{ flex: 1 }}>
      <Hatch />
      <Text variant="h3" style={{ position: 'absolute', bottom: 8, start: 8 }}>
        {label}
      </Text>
    </View>
  );
  return (
    <FormatPicker
      label="Pick how it arrives"
      value={format}
      onChange={setFormat}
      options={[
        { value: 'trailer', label: 'Trailer', preview: thumb('10,000 gates.') },
        { value: 'poster', label: 'Poster', preview: thumb('Kyo to') },
        { value: 'postcard', label: 'Postcard', preview: thumb('Dear crew,') },
      ]}
    />
  );
}

registerFixture('ChatMessage', 'thread', () => (
  <Stack gap="8">
    <ChatMessage kind="divider" text="Today" />
    <ChatMessage
      kind="theirs"
      author="Maya"
      text="who's up for the spa on day 3?"
      avatar={<Face initial="M" index={0} />}
      actions={[
        { id: 'reply', label: 'Reply', onPress: noop },
        { id: 'react', label: 'React', onPress: noop },
      ]}
    />
    <ChatMessage
      kind="guide"
      author="Tokek"
      text="Karsa Spa has three slots at 14:00. Tap in and I'll book it and split it."
      avatar={guide}
      guideColor={tokens.guide.tokek}
      footer={
        <Row>
          <ActionPill tone="primary" label="I'm in · 1 slot left" onPress={noop} />
        </Row>
      }
    />
    <ChatMessage
      kind="photo"
      author="Alex"
      text="Warung lunch"
      avatar={<Face initial="A" index={3} />}
      photo={<Hatch />}
    />
    <ChatMessage kind="mine" text="@tokek can we catch sunset somewhere after?" />
  </Stack>
));
registerFixture('ChatRichCard', 'poll', () => <PollDemo />);
registerFixture('ChatRichCard', 'offer', () => (
  <ChatRichCard
    kind="offer"
    text="Karsa Spa has three slots at 14:00."
    ctaLabel="I'm in · 1 slot left"
    onAccept={noop}
  />
));
registerFixture('ChatRichCard', 'expense', () => (
  <ChatRichCard
    kind="expense"
    title="Maya paid Rp 1.08M for lunch"
    detail="Split 6 ways · $11.37 each"
    actionLabel="View"
    onOpen={noop}
    icon={<Icon name="wallet" decorative />}
  />
));
registerFixture('ChatRichCard', 'boost', () => (
  <ChatRichCard
    kind="boost"
    title="Winston boosted Kyoto"
    detail="Apr 2–16 · split 6 ways"
    perks={['∞ redrafts', 'Live map', 'Pass+ on the trip', 'Up to 16']}
    footer={
      <Row gap="8">
        <ActionPill tone="urgent" label="Settle $2" onPress={noop} />
        <ActionPill label="Thanks Winston" onPress={noop} />
      </Row>
    }
  />
));
registerFixture('ChatRichCard', 'settled', () => (
  <ChatRichCard
    kind="settled"
    label="Settled"
    detail="Maya and Jordan · 3 still to go"
    people={
      <Row gap="2">
        <Face initial="M" index={0} />
        <Face initial="J" index={4} />
      </Row>
    }
  />
));
registerFixture('ChatRichCard', 'typing', () => (
  <ChatRichCard kind="typing" name="Tokek" avatar={guide} />
));
registerFixture('ReactionFloats', 'live', () => <FloatsDemo />);
registerFixture('FormatPicker', 'three formats', () => <FormatDemo />);
registerFixture('AttachmentThumb', 'screenshot and add', () => (
  <Row gap="12">
    <AttachmentThumb preview={<Hatch />} label="Screenshot of Budget" onRemove={noop} />
    <AttachmentThumb onAdd={noop} />
  </Row>
));
registerFixture('Composer', 'idle and typing', () => <ComposerDemo />);
registerFixture('Composer', 'ready to send', () => (
  <Composer
    value="See you at the ferry at 9"
    onChangeText={noop}
    onSend={noop}
    placeholder="Message, or @tokek"
    onAttach={noop}
    recording={false}
    onMicTap={noop}
    onHoldStart={noop}
    onHoldEnd={noop}
  />
));
