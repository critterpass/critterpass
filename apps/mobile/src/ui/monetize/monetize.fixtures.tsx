/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';
import { View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { Card } from '../cards/Card';
import { registerFixture } from '../gallery/registry';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { ActionPill } from '../plan/ActionPill';
import { Face } from '../plan/plan.fixtures';
import { Text } from '../text/Text';
import { Hatch } from '../textures/hatch';
import { BillingToggle } from './BillingToggle';
import { ComparisonTable } from './ComparisonTable';
import { KeptPausedChips } from './KeptPausedChips';
import { PauseBars } from './PauseBars';
import { PerksChecklist } from './PerksChecklist';
import { PlanRadioRows } from './PlanRadioRows';
import { SeatsRow } from './SeatsRow';
import { TeaserPreview } from './TeaserPreview';
import { VisaPaywall } from './VisaPaywall';

const { color } = tokens;
const noop = () => undefined;

function Billing() {
  const [value, setValue] = useState<'monthly' | 'yearly'>('yearly');
  return (
    <BillingToggle
      value={value}
      onChange={setValue}
      options={[
        { value: 'monthly', label: 'Monthly', price: '$3.99' },
        { value: 'yearly', label: 'Yearly', price: '$29.99', badge: '−37%' },
      ]}
    />
  );
}

function Plans() {
  const [value, setValue] = useState('trip');
  return (
    <PlanRadioRows
      label="Boost Kyoto"
      value={value}
      onChange={setValue}
      options={[
        {
          id: 'trip',
          title: 'This trip',
          detail: 'On until a week after you land, Apr 16',
          price: '$12',
        },
        {
          id: 'year',
          title: 'Every trip, all year',
          detail: 'Any trip the Bali Six plan till next October, plus Pass+ for you',
          price: '$59',
        },
      ]}
    />
  );
}

function Table() {
  const [column, setColumn] = useState('pass');
  return (
    <View style={{ backgroundColor: color.paper.base, padding: 16, borderRadius: 20 }}>
      <ComparisonTable
        highlighted={column}
        onHighlight={setColumn}
        columns={[
          { id: 'free', label: 'Free' },
          { id: 'pass', label: 'Pass+' },
          { id: 'boost', label: 'Boost' },
        ]}
        rows={[
          { label: 'Guide chat, voice, camera', values: ['30 a day', '∞', '∞ on trip'] },
          { label: 'Redrafts from the guide', values: ['3 a trip', '3 a trip', '∞'] },
          { label: 'Crew size', values: ['6', '6', '16'] },
          { label: 'Live crew map', values: ['–', '–', '✓'] },
        ]}
      />
    </View>
  );
}

registerFixture('VisaPaywall', 'go further than free', () => (
  <VisaPaywall
    chrome="Visas · Visas · Visas"
    page="Page 07"
    headline="Go further than free"
    visa={
      <Card tone="yellow" halftone>
        <Row justify="space-between" align="flex-start">
          <Text variant="h2">Pass+</Text>
          <Stack align="flex-end">
            <Text variant="h2">$29.99</Text>
            <Text variant="label">A year · $2.50/mo</Text>
          </Stack>
        </Row>
        <Text variant="bodySm">Guide chat, voice and camera without limits. Every icon style.</Text>
      </Card>
    }
    stamps={
      <Text variant="h3" color={color.pink}>
        Trip boost · $12
      </Text>
    }
    note="Critters are never for sale."
    mrz={['P<SGPCRITTERPASS<<WINSTON<<<<<<<<<<<<<<', 'CP0427<<SGP<<PASS<PLUS<<BALI<SIX<<<<<07']}
    footer={
      <Stack gap="12">
        <Billing />
        <ActionPill tone="primary" label="Get Pass+" onPress={noop} />
      </Stack>
    }
  />
));
registerFixture('ComparisonTable', 'what is in each', () => <Table />);
registerFixture('PlanRadioRows', 'boost options', () => <Plans />);
registerFixture('BillingToggle', 'yearly', () => <Billing />);
registerFixture('PerksChecklist', 'welcome to Pass+', () => (
  <PerksChecklist
    perks={[
      {
        id: 'chat',
        text: 'Unlimited chat with Tokek and Pon, voice and camera',
        color: color.yellow,
      },
      { id: 'mail', text: 'Bookings pulled from your email', color: color.pink },
      { id: 'icons', text: 'Every icon style and avatar', color: color.blue },
    ]}
  />
));
registerFixture('SeatsRow', "seven's a crowd", () => (
  <SeatsRow
    capacity={6}
    seats={['W', 'M', 'J', 'R', 'A', 'D'].map((initial, index) => ({
      id: initial,
      name: initial,
      avatar: <Face initial={initial} index={index} />,
    }))}
    waiting={{ id: 'sam', name: 'Sam', avatar: <Face initial="S" index={6} /> }}
  />
));
registerFixture('TeaserPreview', 'live map teaser', () => (
  <TeaserPreview
    preview={<Hatch baseColor={color.map.base} />}
    previewLabel="Preview · your Bali trip"
    eyebrow="Kyoto isn't boosted"
    title="The live map"
    body="Everyone on one map during the trip, with walking times and SOS."
    action={<ActionPill tone="urgent" label="Boost Kyoto · $12" onPress={noop} />}
    dismiss={<ActionPill tone="outline" label="Maybe later" onPress={noop} />}
  />
));
registerFixture('PauseBars', 'pause until Kyoto', () => (
  <PauseBars
    months={[
      { label: 'N', name: 'November', paused: true },
      { label: 'D', name: 'December', paused: true },
      { label: 'J', name: 'January', paused: true },
      { label: 'F', name: 'February', paused: true },
      { label: 'M', name: 'March', paused: false },
      { label: 'A', name: 'April', paused: false, trip: true },
    ]}
  />
));
registerFixture('KeptPausedChips', 'free boost ending', () => (
  <KeptPausedChips
    keptLabel="Kept for good"
    kept={['The plan', '312 photos', 'The recap', '4 critters', 'Map trail']}
    pausedLabel="Pauses Oct 26"
    paused={['Unlimited Tokek', 'Redrafts', 'Live map', 'All icons']}
  />
));
