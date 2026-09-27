/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useState } from 'react';

import { tokens } from '@cp/design-tokens';

import { registerFixture } from '../gallery/registry';
import { PressScale } from '../press/PressScale';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { BalanceBars } from './BalanceBars';
import { CalendarHeatmap } from './CalendarHeatmap';
import { Countdown } from './Countdown';
import { CountUp } from './CountUp';
import { DayBarsVsPlan } from './DayBarsVsPlan';
import type { DaySpend } from './DayBarsVsPlan';
import { Donut } from './Donut';
import { HourlyCrowd } from './HourlyCrowd';
import { LinearBar } from './LinearBar';
import { MonthBars } from './MonthBars';
import { Odometer } from './Odometer';
import { PollBars } from './PollBars';
import { ProgressRing } from './ProgressRing';
import { SegmentedProgress } from './SegmentedProgress';
import { SplitFlap } from './SplitFlap';
import { StreamText } from './StreamText';
import { WeatherStrip } from './WeatherStrip';

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

const inMs = (ms: number) => new Date(Date.now() + ms);

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
registerFixture('HourlyCrowd', 'now marker', () => (
  <HourlyCrowd
    title="Crowds on Apr 3"
    nowHour={7}
    badgeLabel="Go before 7:30"
    hours={[0.1, 0.2, 0.4, 0.7, 0.9, 0.95, 0.85, 0.8, 0.75, 0.6, 0.4, 0.3, 0.2, 0.15, 0.1].map(
      (level, index) => ({
        hour: 6 + index,
        level,
      }),
    )}
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
registerFixture('WeatherStrip', 'rest of the trip', () => (
  <WeatherStrip
    days={[
      { day: 'Wed', place: 'Ubud', temperature: '31°', rain: 0.1 },
      { day: 'Thu', place: 'Batur', temperature: '30°', rain: 0.2 },
      { day: 'Fri', place: 'Boat', temperature: '28°', rain: 0.7 },
      { day: 'Sat', place: 'Free', temperature: '30°', rain: 0.2 },
    ]}
  />
));
registerFixture('CalendarHeatmap', 'April availability', () => (
  <CalendarHeatmap
    title="April 2027"
    weekdays={['M', 'T', 'W', 'T', 'F', 'S', 'S']}
    leadingBlanks={3}
    total={6}
    range={{ from: 2, to: 9 }}
    rangeLabel="Apr 2–9 · all 6 free"
    days={[
      4, 6, 6, 6, 6, 6, 6, 6, 6, 5, 4, 3, 3, 2, 3, 4, 5, 5, 3, 2, 2, 3, 4, 4, 3, 2, 1, 2, 3, 4,
    ].map((free, index) => ({ day: index + 1, free }))}
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
registerFixture('Countdown', 'days away', () => (
  <Countdown target={inMs(17 * 86_400_000 + 4 * 3_600_000)} label="Kyoto in" />
));
registerFixture('Countdown', 'turns urgent', () => (
  <Countdown
    target={inMs(75_000)}
    units="ms"
    label="Leave by"
    urgentLabel="Leave now"
    urgentBelowMs={60_000}
  />
));
registerFixture('Odometer', 'rolling total', () => <OdometerDemo />);
registerFixture('SplitFlap', 'gate change', () => <SplitFlapDemo />);
registerFixture('CountUp', 'recap stat', () => (
  <CountUp value={128} accessibilityLabel="Kilometres walked" />
));
registerFixture('StreamText', 'guide line', () => (
  <StreamText text="Keep going past the Yotsutsuji viewpoint. Most people turn back there." />
));
