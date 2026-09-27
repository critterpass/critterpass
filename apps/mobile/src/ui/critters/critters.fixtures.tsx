/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';

import { tokens } from '@cp/design-tokens';

import { registerFixture } from '../gallery/registry';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill } from '../plan/ActionPill';
import { Face } from '../plan/plan.fixtures';
import { SilhouetteSlot } from '../sticker/SilhouetteSlot';
import { Sticker } from '../sticker/Sticker';
import { BefriendReveal } from './BefriendReveal';
import { CritterDetail } from './CritterDetail';
import { DexHeader } from './DexHeader';
import { EncounterCard } from './EncounterCard';
import { Egg } from './Egg';
import type { EggState } from './Egg';
import { FormSelector } from './FormSelector';
import { HereNowForms } from './HereNowForms';
import { LegendaryBanner } from './LegendaryBanner';
import { MonthStrip } from './MonthStrip';
import { QuestCard } from './QuestCard';
import { SetGrid } from './SetGrid';
import { StickerShelf } from './StickerShelf';
import type { Tier } from './tier';
import { tierColor } from './tier';
import { WanderFootprints } from './WanderFootprints';

const { color, tier: tiers } = tokens;
const noop = () => undefined;
const gecko = (size: number) => <Sticker kind="gecko" name="Tokek" size={size} />;
const locked = (size: number, city: string, gold = false) => (
  <SilhouetteSlot
    kind="gecko"
    city={city}
    size={size}
    maskColor={gold ? tiers.locked.legendary.silhouette : tiers.locked.default}
    glyphColor={gold ? tiers.legendary.color : tiers.epic.color}
  />
);

function DexDemo() {
  const [filter, setFilter] = useState<'all' | 'found' | 'near'>('all');
  return (
    <DexHeader
      found={9}
      total={150}
      placesLabel="6 of 61 places"
      comparison="Maya has 14"
      filter={filter}
      onFilter={setFilter}
      filters={[
        { value: 'all', label: 'All' },
        { value: 'found', label: 'Found' },
        { value: 'near', label: 'Near me' },
      ]}
    />
  );
}

function FormsDemo() {
  const [selected, setSelected] = useState<Tier>('rare');
  return (
    <FormSelector
      label="Forms · 2 of 4"
      selected={selected}
      onSelect={setSelected}
      forms={[
        { tier: 'common', found: true, requirement: 'Be in Bali', sticker: gecko(40) },
        { tier: 'rare', found: true, requirement: 'Three water temples', sticker: gecko(40) },
        {
          tier: 'epic',
          found: false,
          requirement: 'Batur by sunrise',
          sticker: locked(40, 'Bali'),
        },
        {
          tier: 'legendary',
          found: false,
          requirement: 'All six at the top',
          sticker: locked(40, 'Bali', true),
        },
      ]}
    />
  );
}

function EggDemo() {
  const order: readonly EggState[] = ['resting', 'wobbling', 'cracking', 'hatched'];
  const [index, setIndex] = useState(0);
  const state = order[index] ?? 'resting';
  return (
    <Stack gap="12" align="center">
      <Egg state={state} color={color.yellow} hatchling={gecko(96)} hatchlingName="Tokek" />
      <ActionPill
        label={`Next: ${order[(index + 1) % order.length] ?? ''}`}
        onPress={() => setIndex((i) => (i + 1) % order.length)}
      />
    </Stack>
  );
}

registerFixture('DexHeader', 'nine of 150', () => <DexDemo />);
registerFixture('HereNowForms', 'Bali', () => (
  <HereNowForms
    title="Here now · Bali"
    subtitle="Tokek · 2 of 4 forms"
    hint="Epic is tomorrow: summit Batur by sunrise."
    forms={[
      { tier: 'common', found: true, sticker: gecko(56) },
      { tier: 'rare', found: true, sticker: gecko(56) },
      { tier: 'epic', found: false, sticker: locked(56, 'Bali') },
      { tier: 'legendary', found: false, sticker: locked(56, 'Bali', true) },
    ]}
  />
));
registerFixture('LegendaryBanner', 'on your dates', () => (
  <LegendaryBanner
    eyebrow="Legendary on your dates"
    title="Sakura Pon · Kyoto, Apr 2–9"
    silhouette={locked(40, 'Kyoto', true)}
    onPress={noop}
  />
));
registerFixture('SetGrid', 'home set grid', () => (
  <SetGrid
    title="Vietnam"
    countLabel="3/10 · Home set"
    onOpen={noop}
    slots={[
      { id: 'hn', name: 'Cụ Rùa', city: 'Hà Nội', sticker: gecko(48), formsFound: ['common'] },
      { id: 'hl', city: 'Hạ Long', sticker: locked(48, 'Hạ Long') },
      { id: 'sp', city: 'Sa Pa', sticker: locked(48, 'Sa Pa') },
      { id: 'hue', name: 'Chép', city: 'Huế', sticker: gecko(48), formsFound: ['common', 'rare'] },
    ]}
  />
));
registerFixture('SetGrid', 'silhouette row', () => (
  <SetGrid
    variant="row"
    title="#01 France"
    countLabel="2/5 found"
    slots={[
      { id: 'p', city: 'Paris', sticker: locked(36, 'Paris') },
      { id: 'l', city: 'Lyon', sticker: locked(36, 'Lyon') },
    ]}
  />
));
registerFixture('CritterDetail', 'temple Tokek', () => (
  <CritterDetail
    name="Temple Tokek"
    tier="rare"
    habitat="Water temples"
    dexNumber={112}
    sticker={gecko(180)}
    owners={
      <Row gap="2">
        <Face initial="W" index={5} />
        <Face initial="M" index={1} />
      </Row>
    }
    fieldNote="Lives in the spring pools at Tirta Empul. Only comes out when it's quiet."
    fieldNoteSource="From Tokek's field notes"
    guideColor={color.green.base}
    facts={[
      { label: 'Found', value: 'Oct 14, 10:42' },
      { label: 'Where', value: 'Tirta Empul' },
      { label: 'Also has it', value: 'Maya' },
    ]}
  />
));
registerFixture('FormSelector', 'two of four', () => <FormsDemo />);
registerFixture('EncounterCard', 'rare encounter', () => (
  <EncounterCard
    tier="rare"
    habitat="Water temples only"
    title="A temple Tokek is here"
    body="It's shy around crowds. Stay a few minutes and it'll come closer."
    action={<ActionPill tone="success" label="Hold to befriend" onPress={noop} />}
    footnote="Tokek's rare form, 2 of 4"
  />
));
registerFixture('WanderFootprints', 'wandered off', () => (
  <WanderFootprints accessibilityLabel="It wandered off toward the path" />
));
registerFixture('BefriendReveal', 'rare form', () => (
  <BefriendReveal
    eyebrow="Rare form · 2 of 4"
    title="Befriended!"
    critterName="Temple Tokek"
    sticker={gecko(160)}
    chips={['+150 XP', 'Temple Tokek', '2 in the crew']}
    line="You stayed 11 minutes. It noticed."
    color={tierColor('rare')}
  />
));
const MONTHS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
registerFixture('MonthStrip', 'legendary calendar', () => (
  <MonthStrip
    months={MONTHS.map((label, index) => ({
      label,
      name: NAMES[index] ?? '',
      legendary: [3, 5, 7, 10].includes(index),
      current: index === 8,
      inTrip: index === 3,
    }))}
  />
));
registerFixture('QuestCard', 'pips and faces', () => (
  <Stack gap="10">
    <QuestCard
      title="Warung crawl"
      description="Eat at five different warungs."
      color={color.orange}
      progress={{ done: 3, total: 5 }}
      reward="Reward · +120 XP"
    />
    <QuestCard
      title="Sunrise squad"
      description="All six on the Batur summit by 06:10 on Thursday."
      color={color.yellow}
      people={
        <Row gap="2">
          <Face initial="W" index={0} />
          <Face initial="M" index={1} />
        </Row>
      }
      reward="Reward · legendary critter"
      rewardSticker={locked(48, 'Bali', true)}
    />
  </Stack>
));
registerFixture('Egg', 'hatch sequence', () => <EggDemo />);
registerFixture('StickerShelf', 'stamps shelf', () => (
  <StickerShelf
    title="Stickers"
    moreLabel="All 12 ›"
    onMore={noop}
    stickers={[
      { id: '1', label: 'Tokek, common form', sticker: gecko(64) },
      { id: '2', label: 'Temple Tokek, rare form', sticker: gecko(64), onPress: noop },
      {
        id: '3',
        label: 'Undiscovered local, found by being in Kyoto',
        sticker: locked(64, 'Kyoto'),
      },
    ]}
  />
));
