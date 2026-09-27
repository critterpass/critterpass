/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import { useEffect, useState } from 'react';

import { registerFixture } from '../gallery/registry';
import { Text } from '../text/Text';
import { GuideLine } from '../people/GuideLine';
import { Sticker } from '../sticker/Sticker';
import { ChecklistProgress } from './ChecklistProgress';
import type { ChecklistStep } from './ChecklistProgress';
import { ConfirmSheet } from './ConfirmSheet';
import { EmptyState } from './EmptyState';
import { ErrorSheet } from './ErrorSheet';
import { LimitMeter } from './LimitMeter';
import { LockedTeaser } from './LockedTeaser';
import { OfflinePill } from './OfflinePill';
import { OutboxList } from './OutboxList';
import { PendingSync } from './PendingSync';
import { PermissionCard } from './PermissionCard';
import { Skeleton } from './Skeleton';
import { StaleCaption } from './StaleCaption';

const noop = () => undefined;
const HOUR = 3_600_000;

const STEPS = [
  'Reading the crew’s must-dos',
  'Checking opening hours',
  'Balancing the days',
  'Pricing it up',
];

function LiveChecklist() {
  const [done, setDone] = useState(1);
  useEffect(() => {
    const timer = setInterval(
      () => setDone((value) => (value >= STEPS.length ? 0 : value + 1)),
      1500,
    );
    return () => clearInterval(timer);
  }, []);
  const steps: ChecklistStep[] = STEPS.map((label, index) => ({
    key: label,
    label,
    status: index < done ? 'done' : index === done ? 'active' : 'pending',
  }));
  return <ChecklistProgress title="Building your Kyoto plan" steps={steps} />;
}

registerFixture('EmptyState', 'no trips yet', () => (
  <EmptyState
    guide="tokek"
    guideName="Tokek"
    sticker={<Sticker kind="gecko" name="Tokek" pose="sleep" size={120} />}
    title="No trips yet"
    line="Nothing here yet. Want me to find something?"
    action={{ label: 'Start a trip', onPress: noop }}
  />
));
registerFixture('Skeleton', 'card', () => <Skeleton />);
registerFixture('Skeleton', 'list rows', () => <Skeleton preset="list" repeat={3} />);
registerFixture('Skeleton', 'photo + slow hint', () => (
  <Skeleton preset="photo" slowHint={<GuideLine guide="pon" name="Pon" line="Pon's on it…" />} />
));
registerFixture('ErrorSheet', 'three ways forward', () => (
  <ErrorSheet
    eyebrow="Tokek got half of it"
    title="The total, not the lines"
    facts={[
      { key: 'total', ok: true, text: 'Total: Rp 1.080.000 at Ibu Oka' },
      { key: 'lines', ok: false, text: 'Line items: the fold hides all seven' },
    ]}
    alternatives={[
      {
        key: 'type',
        title: 'Type the lines',
        body: 'Tokek fills in the prices it could read',
        onPress: noop,
      },
      {
        key: 'retake',
        title: 'Retake, flatter',
        body: 'Hold it on the table. Tokek will wait',
        onPress: noop,
      },
    ]}
    primary={{ label: 'Split evenly · $11.37 each', onPress: noop }}
    onBack={noop}
    userCaused
  />
));
registerFixture('OfflinePill', 'no signal', () => <OfflinePill />);
registerFixture('OfflinePill', 'needs signal', () => <OfflinePill label="Needs signal" />);
registerFixture('OutboxList', 'queued and sent', () => (
  <OutboxList
    items={[
      { key: '1', label: 'Expense · Smoothie bowls', detail: 'Rp 450.000', state: 'queued' },
      { key: '2', label: 'Vote · Lisbon', state: 'queued' },
      { key: '3', label: 'Photo · Tirta Empul', state: 'sent' },
    ]}
  />
));
registerFixture('StaleCaption', 'hours old', () => (
  <StaleCaption updatedAt={new Date(Date.now() - 3 * HOUR)} />
));
registerFixture('PermissionCard', 'location denied', () => (
  <PermissionCard
    icon="pin"
    title="No location, no leave-by alarms"
    body="I can still plan the day. Tell me where you're staying and I'll time it from there."
    fallback={{ label: 'Type my hotel', onPress: noop }}
    onOpenSettings={noop}
  />
));
registerFixture('LockedTeaser', 'pass+', () => (
  <LockedTeaser
    plan="passPlus"
    perk="See every crew's flights live"
    preview={<Text variant="h3">GA 841 · On time</Text>}
    onPress={noop}
  />
));
registerFixture('LimitMeter', 'some left', () => (
  <LimitMeter label="Guide questions today" used={3} limit={5} resetLabel="Resets at midnight" />
));
registerFixture('LimitMeter', 'exhausted', () => (
  <LimitMeter
    label="Guide questions today"
    used={5}
    limit={5}
    resetLabel="Resets at midnight"
    deferAction={{ label: 'Ask at midnight', onPress: noop }}
  />
));
registerFixture('PendingSync', 'sending', () => (
  <PendingSync
    pending
    author={{ name: 'Maya', joinIndex: 1 }}
    accessibilityLabel="Smoothie bowls, Rp 450.000"
  >
    <Text variant="rowTitle">Smoothie bowls · Rp 450.000</Text>
  </PendingSync>
));
registerFixture('ConfirmSheet', 'button', () => (
  <ConfirmSheet
    title="Leave the Bali Six?"
    consequences={['Your 12 expenses stay with the crew', 'You can rejoin with a new invite']}
    confirmLabel="Leave crew"
    onConfirm={noop}
    onCancel={noop}
  />
));
registerFixture('ConfirmSheet', 'hold', () => (
  <ConfirmSheet
    mode="hold"
    title="Delete your account?"
    consequences={['Your passport, stamps and critters are erased', 'This cannot be undone']}
    confirmLabel="Delete account"
    onConfirm={noop}
    onCancel={noop}
  />
));
registerFixture('ChecklistProgress', 'live job', () => <LiveChecklist />);
