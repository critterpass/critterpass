/**
 * Add a booking (7.03): three tiles (forward any email, scan paper or a screen, paste a link or
 * code), the crew's forward address with Copy, then what was found in the crew's inboxes (Add,
 * Ignore, split) and the guide's note about checking every morning. Mail held from an address
 * nobody linked yet, the mailbox, a link code and typing it in are the quieter ways in.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeOut, LinearTransition, SlideOutRight } from 'react-native-reanimated';

import { guideCritterKind, IconTile, turn, type LineIconName } from '@/features/trip';
import {
  Banner,
  Button,
  GuideNote,
  PressableScale,
  REDUCED_FADE_MS,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useScanLine } from '../add/scan-line';
import type { ImportChannel } from '../add/ImportTiles';
import { useAddBooking } from '../add/use-add-booking';
import { useWalletGuide, WalletGuideProvider } from '../data/wallet-guide';
import { BOOKINGS_ROUTES } from '../routes';
import { CandidateCard } from './components/CandidateCard';

const SHEET_ROUTES = {
  paste: BOOKINGS_ROUTES.paste,
  link: BOOKINGS_ROUTES.linkCode,
  mailbox: BOOKINGS_ROUTES.mailbox,
} as const;

function Tile(props: {
  readonly icon: LineIconName;
  readonly tint: { bg: string; text: string };
  readonly label: string;
  readonly sub: string;
  readonly tilt: number;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  return (
    <PressableScale
      style={styles.tileCell}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      testID={props.testID}
    >
      <View
        style={[
          styles.tile,
          {
            borderRadius: th.radius.card,
            backgroundColor: th.color.card,
            boxShadow: th.shadow.card,
          },
        ]}
      >
        <View style={{ transform: [turn(props.tilt)] }}>
          <IconTile name={props.icon} bg={props.tint.bg} color={props.tint.text} size={44} />
        </View>
        <View>
          <Text variant="rowTitle">{props.label}</Text>
          <Text variant="captionMuted" tone="muted">
            {props.sub}
          </Text>
        </View>
      </View>
    </PressableScale>
  );
}

function Body({ add }: { readonly add: ReturnType<typeof useAddBooking> }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const reduced = usePremiumReducedMotion();
  const guide = useWalletGuide();
  const p = add.props;
  const scanLine = useScanLine(p.scan);
  const pending = p.candidates.filter((view) => view.state === 'pending');
  const allBroughtIn = pending.length > 0 && pending.every((view) => view.broughtIn);
  const channel = (c: ImportChannel) => () => p.onChannel(c);
  const count = p.heldMail ?? 0;
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.body,
        { paddingHorizontal: th.space.gutter, gap: th.space.gap14 },
      ]}
    >
      <Text variant="largeTitle" accessibilityRole="header">
        {t({ id: 'bookings.add.title', message: 'Add a booking' })}
      </Text>
      <View style={styles.tiles}>
        <Tile
          icon="chat"
          tint={th.color.status.rain}
          label={t({ id: 'bookings.premium.tileForward', message: 'Forward' })}
          sub={t({ id: 'bookings.premium.tileForwardSub', message: 'Any email' })}
          tilt={-6}
          onPress={channel('forward')}
          testID="bookings-add-forward"
        />
        <Tile
          icon="scan"
          tint={th.color.status.voteOpen}
          label={t({ id: 'bookings.premium.tileScan', message: 'Scan' })}
          sub={t({ id: 'bookings.premium.tileScanSub', message: 'Paper or screen' })}
          tilt={5}
          onPress={channel('scan')}
          testID="bookings-add-scan"
        />
        <Tile
          icon="link"
          tint={th.color.status.booked}
          label={t({ id: 'bookings.premium.tilePaste', message: 'Paste' })}
          sub={t({ id: 'bookings.premium.tilePasteSub', message: 'A link or code' })}
          tilt={-4}
          onPress={channel('paste')}
          testID="bookings-add-paste"
        />
      </View>
      {scanLine === null ? null : (
        <Text variant="caption" tone="muted" testID="bookings-scan-line">
          {scanLine}
        </Text>
      )}
      {p.address === null ? null : (
        <View
          style={[
            styles.address,
            {
              borderRadius: th.radius.field,
              backgroundColor: th.color.card,
              boxShadow: th.shadow.card,
            },
          ]}
        >
          <Text variant="mono" style={styles.flex} numberOfLines={1} selectable>
            {p.address}
          </Text>
          <Button
            label={t({ id: 'bookings.premium.copy', message: 'Copy' })}
            size="small"
            variant="control"
            onPress={() => void p.onCopy(p.address ?? '')}
            testID="bookings-add-copy"
          />
        </View>
      )}
      {p.noTrip ? (
        <Text variant="body" tone="muted" testID="bookings-add-no-trip">
          {t({
            id: 'bookings.add.noTrip',
            message: 'Bookings land in a trip. Start one with the crew and they show up here.',
          })}
        </Text>
      ) : null}
      {count > 0 ? (
        <Banner
          tone="info"
          text={t({
            id: 'bookings.heldMail.title',
            message: plural(count, { one: 'Mail is waiting', other: '# emails are waiting' }),
          })}
          action={{
            label: t({ id: 'bookings.premium.linkIt', message: 'Link it' }),
            onPress: p.heldMailCodeSent === true ? p.onLinkCode : channel('paste'),
          }}
          testID="bookings-held-mail"
        />
      ) : null}
      {pending.length === 0 ? null : (
        <Text variant="label" tone="muted">
          {allBroughtIn
            ? t({ id: 'bookings.add.read', message: `Ready to add · ${pending.length}` })
            : t({
                id: 'bookings.add.found',
                message: `Found in your crew’s inboxes · ${pending.length}`,
              })}
        </Text>
      )}
      <View style={{ gap: th.space.gap10 }} testID="bookings-candidates">
        {p.candidates.map((view) => (
          // Added slides out to the right, ignored fades; the list closes the gap (7.03, Smooth).
          <Animated.View
            key={view.id}
            exiting={
              reduced
                ? FadeOut.duration(REDUCED_FADE_MS)
                : p.leaving[view.id] === 'add'
                  ? SlideOutRight.springify()
                  : FadeOut
            }
            {...(reduced ? {} : { layout: LinearTransition.springify() })}
          >
            <CandidateCard
              view={view}
              split={p.splits[view.id] ?? view.canSplit}
              tz={p.tz}
              onSplit={(next) => p.onSplit(view.id, next)}
              onAdd={() => p.onAdd(view.id)}
              onIgnore={() => p.onIgnore(view.id)}
              onByHand={() => p.onByHand(view.id)}
            />
          </Animated.View>
        ))}
      </View>
      <GuideNote
        name={guide.name}
        critter={guideCritterKind(guide.id)}
        text={
          p.mailboxConnected
            ? t({
                id: 'bookings.mailbox.footnote',
                message:
                  'I check for new confirmations every morning. You can switch that off in Settings.',
              })
            : t({
                id: 'bookings.add.mailboxOffer',
                message: 'I can also check your inbox for new confirmations every morning.',
              })
        }
        action={{
          label: t({ id: 'bookings.mailbox.title', message: 'Find bookings in my email' }),
          onPress: p.onMailbox,
        }}
        testID="bookings-add-footnote"
      />
      <View style={styles.links}>
        <TextButton
          label={t({ id: 'bookings.add.byHand', message: 'Or type it in by hand' })}
          onPress={p.onTypeIn}
          testID="bookings-add-by-hand"
        />
        <TextButton
          label={t({ id: 'bookings.add.linkCode', message: 'Got a code? Link your email' })}
          onPress={p.onLinkCode}
          testID="bookings-add-link-code"
        />
      </View>
    </ScrollView>
  );
}

export function AddBookingPremium({ start }: { readonly start?: string | undefined }) {
  const { t } = useLingui();
  const add = useAddBooking(start);
  const { sheet, setSheet } = add;
  // Paste, the link code and the mailbox are native form sheets over this page (a tile, a link
  // below, or `start` from another page).
  useEffect(() => {
    if (sheet === null) return;
    setSheet(null);
    router.push(SHEET_ROUTES[sheet]);
  }, [sheet, setSheet]);
  const back = t({ id: 'bookings.back', message: 'Bookings' });
  return (
    <WalletGuideProvider tripId={add.guideTripId}>
      <PushScreen
        title={t({ id: 'bookings.add.title', message: 'Add a booking' })}
        backLabel={back}
        scroll={false}
        testID="bookings-add"
      >
        <Body add={add} />
      </PushScreen>
    </WalletGuideProvider>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 8, paddingBottom: 40 },
  tiles: { flexDirection: 'row', gap: 10 },
  tileCell: { flex: 1 },
  tile: { height: 120, padding: 12, justifyContent: 'space-between' },
  address: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingLeft: 16,
    paddingRight: 8,
  },
  flex: { flex: 1, minWidth: 0 },
  links: { alignItems: 'center', gap: 4 },
});
