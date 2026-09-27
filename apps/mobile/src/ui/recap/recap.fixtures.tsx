/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { registerFixture } from '../gallery/registry';
import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { ActionPill, Tag } from '../plan/ActionPill';
import { Face } from '../plan/plan.fixtures';
import { Text } from '../text/Text';
import { Hatch } from '../textures/hatch';
import { AwardsGrid } from './AwardsGrid';
import { GotAway } from './GotAway';
import { MemoryHero } from './MemoryHero';
import { RecapStatTiles } from './RecapStatTiles';
import { RouteRider } from './RouteRider';
import { StampSpread } from './StampSpread';

const { color } = tokens;
const noop = () => undefined;

registerFixture('RecapStatTiles', 'Bali recap', () => (
  <RecapStatTiles
    stats={[
      { id: 'km', value: '214 km', caption: 'driven, mostly by Made', color: color.yellow },
      { id: 'volcano', value: '1 volcano', caption: 'climbed before sunrise', color: color.pink },
      { id: 'photos', value: '312 photos', caption: 'Jordan took 140 of them', color: color.blue },
      { id: 'owed', value: '$0 owed', caption: 'settled two days early', color: color.green.base },
    ]}
  />
));
registerFixture('AwardsGrid', 'six awards', () => (
  <AwardsGrid
    onVoteMvp={noop}
    awards={[
      {
        id: 'riser',
        title: 'Earliest riser',
        line: 'Up at 02:51 on Batur day. Nobody asked.',
        personName: 'Jordan',
        color: color.yellow,
        avatar: <Face initial="J" index={4} />,
        mvp: true,
      },
      {
        id: 'camera',
        title: 'Human camera',
        line: '140 of the 312 photos, 9 of them good.',
        personName: 'Maya',
        color: color.pink,
        avatar: <Face initial="M" index={1} />,
      },
      {
        id: 'treasurer',
        title: 'The treasurer',
        line: 'Logged 23 expenses. Found the $4 error.',
        personName: 'Rin',
        color: color.green.base,
        avatar: <Face initial="R" index={3} />,
      },
      {
        id: 'find',
        title: 'Best find',
        line: 'Warung Pondok. Back twice in one day.',
        personName: 'Alex',
        color: color.blue,
        avatar: <Face initial="A" index={2} />,
      },
    ]}
  />
));
registerFixture('RouteRider', 'the route', () => (
  <RouteRider
    distance="214 km"
    reached={3}
    rider={<Icon name="car" size={28} decorative />}
    stops={[
      { id: 's', name: 'Seminyak', dayLabel: 'Day 1' },
      { id: 'u', name: 'Ubud', dayLabel: 'Days 2–4' },
      { id: 'b', name: 'Batur', dayLabel: 'Day 4 · 02:51', highlight: true },
      { id: 'a', name: 'Amed', dayLabel: 'Day 5' },
      { id: 'n', name: 'Nusa Penida', dayLabel: 'Day 6' },
    ]}
  />
));
registerFixture('GotAway', 'golden Tokek', () => (
  <GotAway
    silhouette={
      <Text variant="displayXl" color={color.gold.base}>
        ?
      </Text>
    }
    eyebrow="The one that got away"
    name="Golden Tokek"
    story="Seen twice on Batur, befriended by nobody. Dev slept through the second one. It comes back in the dry season, May to September."
    formsLabel="3 of 4 forms"
    action={<ActionPill tone="primary" label="Remind me in May" onPress={noop} />}
  />
));
registerFixture('StampSpread', 'stamp 13', () => (
  <StampSpread
    chrome="Entries · Entrées"
    page="Page 13"
    stamp={
      <View
        style={{
          borderWidth: 3,
          borderColor: color.orange,
          borderRadius: 80,
          padding: 24,
          transform: [{ rotate: '-8deg' }],
        }}
      >
        <Text variant="h2" color={color.orange}>
          Bali
        </Text>
      </View>
    }
    signatures={
      <Row gap="12" wrap>
        <Text variant="voiceSignature" color={tokens.guide.onPaper.ajo}>
          Maya ✶
        </Text>
        <Text variant="voiceSignature" color={tokens.guide.onPaper.lundi}>
          Jordan
        </Text>
      </Row>
    }
    caption="Stamp 13 is Bali"
    detail="The crew signed it. It's on your profile now."
  />
));
registerFixture('MemoryHero', 'a year later', () => (
  <MemoryHero
    photo={<Hatch />}
    photoLabel="The six of you on Batur, 06:02"
    eyebrow="One year ago today"
    title="Batur, a year on"
    body="Oct 15, 2026. Six of you on top of a volcano at 06:02. Jordan still has the headlamp."
    reactions={
      <Row gap="6">
        <Tag label="Maya ❤ 2" color={color.pink} />
        <Tag label="Jordan “again??”" color={color.yellow} />
      </Row>
    }
  />
));
