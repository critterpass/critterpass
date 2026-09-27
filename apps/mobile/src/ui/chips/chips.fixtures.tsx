/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';

import { tokens } from '@cp/design-tokens';

import { registerFixture } from '../gallery/registry';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { AvatarStack } from '../people/AvatarStack';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { ChoiceChip } from './ChoiceChip';
import { CountBadge } from './CountBadge';
import { FilterChip } from './FilterChip';
import { InfoPill } from './InfoPill';
import { QuickActionChip } from './QuickActionChip';
import { StatChipRow } from './StatChipRow';
import type { ChipStatus } from './StatusChip';
import { StatusChip } from './StatusChip';
import { TierLabel } from './TierLabel';
import { TiltedSticker } from './TiltedSticker';

const noop = () => undefined;
const STATUSES: readonly ChipStatus[] = [
  'booked',
  'vote',
  'in',
  'maybe',
  'unopened',
  'planned',
  'building',
  'ended',
  'live',
  'free',
  'boost',
  'passPlus',
];

function Choices() {
  const [picked, setPicked] = useState<readonly string[]>(['Sunrise']);
  const toggle = (value: string) =>
    setPicked((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    );
  return (
    <Row gap="8" wrap>
      {['Sunrise', 'Street food', 'Easy', 'Museums', 'Night owl'].map((value, index) => (
        <ChoiceChip
          key={value}
          label={value}
          tilt={index % 2 === 0 ? -2 : 2}
          selected={picked.includes(value)}
          onPress={() => toggle(value)}
        />
      ))}
    </Row>
  );
}

function Filters() {
  const [on, setOn] = useState('Food');
  return (
    <Row gap="8" wrap>
      {[
        ['All', 48],
        ['Food', 12],
        ['Sights', 9],
      ].map(([label, count]) => (
        <FilterChip
          key={String(label)}
          label={String(label)}
          count={Number(count)}
          selected={on === label}
          onPress={() => setOn(String(label))}
        />
      ))}
    </Row>
  );
}

registerFixture('ChoiceChip', 'tilted, selected double ring', () => <Choices />);
registerFixture('FilterChip', 'with counts', () => <Filters />);
registerFixture('QuickActionChip', 'suggestions', () => (
  <Row gap="8" wrap>
    <QuickActionChip label="Find a café" icon="food" onPress={noop} />
    <QuickActionChip label="Split it" icon="wallet" onPress={noop} />
  </Row>
));
registerFixture('InfoPill', 'on colour hero', () => (
  <SurfaceToneProvider value="accent">
    <Row gap="8" padding="12" style={{ backgroundColor: tokens.color.yellow }}>
      <InfoPill accessibilityLabel="17 days, 5 hours to go">17d 05:26:47</InfoPill>
      <InfoPill variant="outline">Plan 80%</InfoPill>
    </Row>
  </SurfaceToneProvider>
));
registerFixture('InfoPill', 'on dark', () => <InfoPill icon="cal">Apr 2–9</InfoPill>);
registerFixture('StatusChip', 'every status', () => (
  <Row gap="8" wrap>
    {STATUSES.map((status) => (
      <StatusChip key={status} status={status} />
    ))}
  </Row>
));
registerFixture('CountBadge', 'counts', () => (
  <Row gap="12">
    <CountBadge count={3} />
    <CountBadge count={42} />
    <CountBadge count={140} accessibilityLabel="140 unread messages" />
  </Row>
));
registerFixture('TierLabel', 'all tiers', () => (
  <Stack gap="6">
    <TierLabel tier="common" />
    <TierLabel tier="rare" suffix="Water temples only" />
    <TierLabel tier="epic" />
    <TierLabel tier="legendary" />
  </Stack>
));
registerFixture('StatChipRow', 'recap stats', () => (
  <StatChipRow
    stats={[
      { key: 'c', value: '12', label: 'critters' },
      { key: 's', value: '3', label: 'stamps' },
      { key: 'k', value: '412', label: 'km' },
    ]}
  />
));
registerFixture('TiltedSticker', 'vote board labels', () => (
  <Row gap="16" wrap>
    <TiltedSticker label="Kyoto" tone="orange" detail="3 votes" onPress={noop}>
      <AvatarStack
        size="sm"
        members={[
          { key: 'm', name: 'Maya', joinIndex: 1 },
          { key: 'a', name: 'Ari', joinIndex: 2 },
          { key: 'w', name: 'Winston', joinIndex: 0 },
        ]}
      />
    </TiltedSticker>
    <TiltedSticker label="Lisbon" tone="blue" tilt={3} />
    <TiltedSticker label="Reykjavík" tilt={-2} />
  </Row>
));
