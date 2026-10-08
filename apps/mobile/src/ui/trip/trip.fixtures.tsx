/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */

import { tokens } from '@cp/design-tokens';

import { registerFixture } from '../gallery/registry';
import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { Face } from '../plan/plan.fixtures';
import { EmergencyTiles } from './EmergencyTiles';
import { ImportTiles } from './ImportTiles';
import { LeaveByHero } from './LeaveByHero';
import { PhraseCard } from './PhraseCard';
import { WatchRow } from './WatchRow';

const noop = () => undefined;
const { color } = tokens;
registerFixture('LeaveByHero', 'sunrise climb', () => (
  <LeaveByHero
    eyebrow="Thu Oct 15 · Day 4"
    trailing="9° at the top"
    label="Leave by"
    time="03:10"
    spokenTime="3:10 AM"
    instructions="Pickup at the villa gate, 03:30. Bring the headlamp, the path is dark."
    ring={{ progress: 0.62, value: '21:29', caption: 'to go', spoken: '21 minutes to go' }}
    crew={
      <Row gap="2">
        <Face initial="W" index={2} />
        <Face initial="M" index={0} />
        <Face initial="J" index={4} />
      </Row>
    }
    crewLabel="4 of 6 are up"
    crewDetail="Tokek rings Alex and Dev at 03:00"
  />
));
registerFixture('PhraseCard', 'show to driver', () => (
  <PhraseCard
    eyebrow="Show this to Made"
    phrase="Tolong ke Villa Kayu Manis, Jalan Raya Sayan, Ubud."
    lang="id"
    translation="“Please take us to Villa Kayu Manis, Sayan road, Ubud.”"
    tone="paper"
    onPlay={noop}
  />
));
registerFixture('EmergencyTiles', 'need a hand', () => (
  <EmergencyTiles
    primary={{ number: '112', label: 'Ambulance, police, fire', onCall: noop }}
    secondary={{ number: '110', label: 'Tourist police', onCall: noop }}
    problems={[
      { id: 'hurt', label: 'Hurt or sick', onPress: noop, icon: <Icon name="heart" decorative /> },
      {
        id: 'lost',
        label: 'Lost or stolen',
        onPress: noop,
        icon: <Icon name="wallet" decorative />,
      },
      { id: 'me', label: "I'm lost", onPress: noop, icon: <Icon name="pin" decorative /> },
      { id: 'ride', label: 'Missed a ride', onPress: noop, icon: <Icon name="car" decorative /> },
    ]}
    clinic={{
      name: 'BIMC Ubud · open 24h',
      detail: '9 min by car · takes your insurance',
      actionLabel: 'Go',
      onGo: noop,
    }}
  />
));
registerFixture('WatchRow', 'forecast watch list', () => (
  <>
    <WatchRow
      icon={<Icon name="wave" decorative />}
      title="Rough seas Friday"
      detail="Waves up to 2.5m. Fast boats might not run."
      status="Plan B"
      tone="urgent"
      onPress={noop}
    />
    <WatchRow
      icon={<Icon name="temple" decorative />}
      title="Ceremony in Ubud today"
      detail="A procession closes Jalan Raya 13:00–15:00."
      status="Watching"
      tone="warning"
    />
    <WatchRow
      icon={<Icon name="volcano" decorative />}
      title="Batur tomorrow"
      detail="Clear at the summit, 80%."
      status="Go"
      tone="success"
    />
  </>
));
registerFixture('ImportTiles', 'add a booking', () => (
  <ImportTiles
    sources={[
      { id: 'fwd', label: 'Forward', detail: 'Any email', color: color.yellow, onPress: noop },
      { id: 'scan', label: 'Scan', detail: 'Paper or screen', color: color.pink, onPress: noop },
      { id: 'paste', label: 'Paste', detail: 'A link or code', color: color.blue, onPress: noop },
    ]}
    address={{ value: 'bali-six@in.critterpass.app', onCopy: noop }}
  />
));
