/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';

import { tokens } from '@cp/design-tokens';

import { registerFixture } from '../gallery/registry';
import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { Face } from '../plan/plan.fixtures';
import { Text } from '../text/Text';
import { CrewRail } from './CrewRail';
import { EmergencyTiles } from './EmergencyTiles';
import { EtaList } from './EtaList';
import { ImportTiles } from './ImportTiles';
import { LeaveByHero } from './LeaveByHero';
import { PackingChips } from './PackingChips';
import { ParsedBookingCard } from './ParsedBookingCard';
import { PhraseCard } from './PhraseCard';
import { SupplierCard } from './SupplierCard';
import { TimelineList } from './TimelineList';
import { WatchRow } from './WatchRow';

const noop = () => undefined;
const { color } = tokens;

function PackingDemo() {
  const [items, setItems] = useState([
    { id: 'lamp', label: 'Headlamp', packed: true },
    { id: 'layer', label: 'Warm layer', packed: true },
    { id: 'cash', label: 'Rp 50k for coffee', packed: false },
    { id: 'shoes', label: 'Trail shoes', packed: false },
  ]);
  return (
    <PackingChips
      items={items}
      onToggle={(id) =>
        setItems((list) =>
          list.map((item) => (item.id === id ? { ...item, packed: !item.packed } : item)),
        )
      }
    />
  );
}

function BookingDemo() {
  const [split, setSplit] = useState(true);
  return (
    <ParsedBookingCard
      title="Kura Kura fast boat"
      fields={['Fri Oct 16', 'Sanur → Penida', '6 seats', '$228']}
      source="From Alex's email"
      split={{ label: 'Split 6 ways', on: split, onToggle: () => setSplit((s) => !s) }}
      addLabel="Add"
      onAdd={noop}
      ignoreLabel="Ignore"
      onIgnore={noop}
    />
  );
}

registerFixture('EtaList', 'meet-up', () => (
  <EtaList
    entries={[
      {
        id: 'mr',
        name: 'Maya and Rin',
        status: 'Leaving Karsa Spa',
        eta: '16:52',
        avatar: <Face initial="M" index={0} />,
      },
      {
        id: 'j',
        name: 'Jordan',
        status: 'On the scooter, 2 km out',
        eta: '16:49',
        avatar: <Face initial="J" index={4} />,
      },
      {
        id: 'd',
        name: 'Dev',
        status: 'Paused sharing at 14:00',
        avatar: <Face initial="D" index={5} />,
      },
    ]}
  />
));
registerFixture('CrewRail', 'heading to the flag', () => (
  <CrewRail
    destination="Campuhan Ridge"
    members={[
      {
        id: 'w',
        name: 'Winston',
        progress: 1,
        etaLabel: 'here',
        avatar: <Face initial="W" index={2} />,
      },
      {
        id: 'm',
        name: 'Maya',
        progress: 0.7,
        etaLabel: '5 min',
        avatar: <Face initial="M" index={0} />,
      },
      {
        id: 'j',
        name: 'Jordan',
        progress: 0.35,
        etaLabel: '8 min',
        avatar: <Face initial="J" index={4} />,
      },
      {
        id: 'd',
        name: 'Dev',
        progress: 0.05,
        etaLabel: '21 min',
        avatar: <Face initial="D" index={5} />,
      },
    ]}
  />
));
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
registerFixture('PackingChips', 'half packed', () => <PackingDemo />);
registerFixture('TimelineList', 'rest of the day', () => (
  <TimelineList
    items={[
      { id: '1', time: '06:10', title: 'Sunrise at the summit', detail: 'Guide: Ketut · 2h climb' },
      { id: '2', time: '09:30', title: 'Toya Devasya hot springs', detail: 'Tickets in Bookings' },
      {
        id: '3',
        time: '13:00',
        title: 'Nap. Tokek is guarding it.',
        detail: 'Nothing booked until 16:00',
      },
    ]}
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
registerFixture('ParsedBookingCard', 'from an email', () => <BookingDemo />);
registerFixture('SupplierCard', 'live supplier data', () => (
  <SupplierCard
    title="Mount Batur Sunrise Trekking with Breakfast"
    price="US$ 42.50"
    fields={[
      { label: 'Duration', value: '6-7 hours' },
      { label: 'Pickup', value: 'Ubud area hotels, 02:00-02:30' },
      { label: 'Free cancellation', value: 'Up to 24 hours before' },
    ]}
    attribution="Prices and availability from Klook"
    disclosure={<Text variant="caption">We may earn a commission if you book.</Text>}
    cta={{ label: 'Book for 6', onPress: noop }}
  />
));
