/* eslint-disable lingui/no-unlocalized-strings -- dev-gallery sample copy; fixture files are loaded only by the (dev) gallery and never ship. */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { registerFixture } from '../gallery/registry';
import { Text } from '../text/Text';
import { GuideLine } from '../people/GuideLine';
import { Sticker } from '../sticker/Sticker';
import { ConfirmSheet } from './ConfirmSheet';
import { EmptyState } from './EmptyState';
import { ErrorSheet } from './ErrorSheet';
import { LockedTeaser } from './LockedTeaser';
import { OfflinePill } from './OfflinePill';
import { PendingSync } from './PendingSync';
import { PermissionCard } from './PermissionCard';
import { ScreenLoading } from './ScreenLoading';
import { ScreenMissing } from './ScreenMissing';
import { Skeleton } from './Skeleton';
import { StaleCaption } from './StaleCaption';

const noop = () => undefined;
const HOUR = 3_600_000;
/** Room for a whole-screen state inside the gallery's page. */
const SCREEN_HEIGHT = 520;
const NO_INSETS = {
  frame: { x: 0, y: 0, width: 0, height: 0 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** A whole-screen state drawn as a card of the gallery page: its own frame, no device insets. */
function ScreenFrame({ children }: { readonly children: ReactNode }) {
  return (
    <View style={{ height: SCREEN_HEIGHT }}>
      <SafeAreaProvider initialMetrics={NO_INSETS}>{children}</SafeAreaProvider>
    </View>
  );
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
registerFixture('ScreenLoading', 'pushed screen, still reading', () => (
  <ScreenFrame>
    <ScreenLoading backLabel="BOOKINGS" label="Loading the booking" />
  </ScreenFrame>
));
registerFixture('ScreenMissing', 'default copy', () => (
  <ScreenFrame>
    <ScreenMissing backLabel="BOOKINGS" />
  </ScreenFrame>
));
registerFixture('ScreenMissing', 'own copy and a second action', () => (
  <ScreenFrame>
    <ScreenMissing
      backLabel="TRIP"
      title="This booking was removed"
      line="Maya took it off the trip. The rest of the wallet is still here."
      action={{ label: 'Back to bookings', onPress: noop }}
      secondaryAction={{ label: 'Add it again', onPress: noop }}
      testID="screen-missing-own"
    />
  </ScreenFrame>
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
