/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';

import { tokens } from '@cp/design-tokens';

import { registerFixture } from '../gallery/registry';
import { PressScale } from '../press/PressScale';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { BalanceBars } from './BalanceBars';
import { CountUp } from './CountUp';
import { DayBarsVsPlan } from './DayBarsVsPlan';
import type { DaySpend } from './DayBarsVsPlan';
import { Donut } from './Donut';
import { LinearBar } from './LinearBar';
import { MonthBars } from './MonthBars';
import { Odometer } from './Odometer';
import { PollBars } from './PollBars';
import { ProgressRing } from './ProgressRing';
import { SegmentedProgress } from './SegmentedProgress';
import { SplitFlap } from './SplitFlap';

const { color } = tokens;

function Bump({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  return (
    <PressScale accessibilityLabel={label} onPress={onPress}>
      <Text variant="buttonSm">{label}</Text>
    </PressScale>
  );
}

function OdometerDemo() {
  const [value, setValue] = useState(4812);
  return (
    <Stack gap="8">
      <Odometer value={value} prefix="$" accessibilityLabel="Spent" />
      <Bump label="Add expense" onPress={() => setValue((v) => v + 68)} />
    </Stack>
  );
}

function SplitFlapDemo() {
  const [gate, setGate] = useState('GATE 7');
  return (
    <Stack gap="8">
      <SplitFlap value={gate} length={7} accessibilityLabel="Departure gate" />
      <Bump
        label="Change gate"
        onPress={() => setGate((g) => (g === 'GATE 7' ? 'GATE 12' : 'GATE 7'))}
      />
    </Stack>
  );
}

registerFixture('SegmentedProgress', 'two of four', () => (
  <SegmentedProgress total={4} done={2} label="Kyoto setup" />
));
registerFixture('SegmentedProgress', 'ping budget', () => (
  <SegmentedProgress total={10} done={7} color={color.pink} label="Pings this week" />
));
registerFixture('LinearBar', 'category', () => (
  <LinearBar
    label="Stays"
    valueLabel="$1,840 / $2,700"
    value={1840}
    max={2700}
    color={color.blue}
  />
));
registerFixture('LinearBar', 'over budget', () => (
  <LinearBar
    label="Food"
    valueLabel="$1,620 / $1,500"
    value={1620}
    max={1500}
    overLabel="Over by $120"
  />
));
registerFixture('LinearBar', 'with today marker', () => (
  <LinearBar value={4812} max={7440} marker={{ at: 0.62, label: 'Today' }} />
));
registerFixture('ProgressRing', 'draining', () => (
  <ProgressRing progress={0.35} size={96} stroke={8} accessibilityLabel="35 minutes left">
    <Text variant="h3">35m</Text>
  </ProgressRing>
));
registerFixture('ProgressRing', 'complete', () => (
  <ProgressRing progress={1} color={color.green.base} />
));
registerFixture('Donut', 'spend by category', () => (
  <Donut
    title="Spent by category"
    segments={[
      { label: 'Stays', value: 1840, color: color.blue },
      { label: 'Food', value: 1160, color: color.pink },
      { label: 'Transit', value: 620, color: color.green.base },
      { label: 'Fun', value: 1192, color: color.orange },
    ]}
  >
    <Text variant="h3">$4,812</Text>
  </Donut>
));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
registerFixture('MonthBars', 'best time to go', () => (
  <MonthBars
    title="Best time to go"
    months={MONTHS.map((label, index) => ({
      label,
      value: [0.3, 0.4, 0.8, 1, 0.7, 0.4, 0.3, 0.3, 0.5, 0.8, 0.9, 0.5][index] ?? 0,
      highlight: label === 'Apr' || label === 'Nov',
    }))}
  />
));
registerFixture('BalanceBars', 'crew of six', () => (
  <BalanceBars
    owesHeading="Owes"
    owedHeading="Is owed"
    balances={[
      { name: 'You', direction: 'owed', fraction: 1, amountLabel: '+186.40' },
      { name: 'Maya', direction: 'owed', fraction: 0.22, amountLabel: '+41.00' },
      { name: 'Dev', direction: 'even', fraction: 0, amountLabel: '0.00' },
      { name: 'Rin', direction: 'owes', fraction: 0.22, amountLabel: '−41.00' },
      { name: 'Jordan', direction: 'owes', fraction: 0.49, amountLabel: '−92.10' },
      { name: 'Alex', direction: 'owes', fraction: 0.51, amountLabel: '−94.30' },
    ]}
  />
));
registerFixture('DayBarsVsPlan', 'day five of eight', () => (
  <DayBarsVsPlan
    title="By day"
    legend="Dashes = plan"
    days={[0.7, 0.8, 0.55, 1, 0.66]
      .map<DaySpend>((actual, index) => ({
        label: `D${index + 1}`,
        actual,
        plan: 0.1,
        amountLabel: `$${Math.round(actual * 900)}`,
        today: index === 4,
      }))
      .concat([6, 7, 8].map((day) => ({ label: `D${day}`, plan: 0.1, amountLabel: 'not yet' })))}
  />
));
registerFixture('PollBars', 'final vote', () => (
  <PollBars
    question="Next trip"
    options={[
      { label: 'Kyoto', votes: 3, color: color.orange, mine: true },
      { label: 'Lisbon', votes: 1, color: color.green.base },
    ]}
  />
));
registerFixture('Odometer', 'rolling total', () => <OdometerDemo />);
registerFixture('SplitFlap', 'gate change', () => <SplitFlapDemo />);
registerFixture('CountUp', 'recap stat', () => (
  <CountUp value={128} accessibilityLabel="Kilometres walked" />
));
