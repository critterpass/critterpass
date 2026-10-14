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
import { premium } from '@cp/design-tokens';
import Animated, { SlideOutRight } from 'react-native-reanimated';

import { guideCritterKind } from '@/features/trip';
import {
  Banner,
  Button,
  exitTransition,
  GuideNote,
  Icon,
  layoutTransition,
  ListCard,
  Row,
  StickerIcon,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useScanLine } from '../add/scan-line';
import type { ImportChannel } from '../add/view-types';
import { useAddBooking } from '../add/use-add-booking';
import { useWalletGuide, WalletGuideProvider } from '../data/wallet-guide';
import { BOOKINGS_ROUTES } from '../routes';
import { AddTile } from './components/AddTile';
import { CandidateCard } from './components/CandidateCard';
import { useAddressCopiedToast } from './components/ConfirmationCode';

/** An added booking slides off to the right on Smooth. */
const SLIDE_OUT = SlideOutRight.springify()
  .stiffness(premium.spring.smooth.stiffness)
  .damping(premium.spring.smooth.damping)
  .mass(premium.spring.smooth.mass);

const SHEET_ROUTES = {
  paste: BOOKINGS_ROUTES.paste,
  link: BOOKINGS_ROUTES.linkCode,
  mailbox: BOOKINGS_ROUTES.mailbox,
} as const;

function Body({ add }: { readonly add: ReturnType<typeof useAddBooking> }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const copied = useAddressCopiedToast();
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
      <View style={styles.tiles}>
        <AddTile
          sticker="chat"
          label={t({ id: 'bookings.premium.tileForward', message: 'Forward' })}
          sub={t({ id: 'bookings.premium.tileForwardSub', message: 'Any email' })}
          tilt={-6}
          onPress={channel('forward')}
          testID="bookings-add-forward"
        />
        <AddTile
          sticker="camera"
          label={t({ id: 'bookings.premium.tileScan', message: 'Scan' })}
          sub={t({ id: 'bookings.premium.tileScanSub', message: 'Paper or screen' })}
          tilt={5}
          onPress={channel('scan')}
          testID="bookings-add-scan"
        />
        <AddTile
          sticker="ticket"
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
          {/* The whole address on one line: no tracking, and it shrinks before it cuts. */}
          <Text
            variant="mono"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            ellipsizeMode="middle"
            selectable
            style={[styles.addressText, styles.asWritten]}
          >
            {p.address}
          </Text>
          <Button
            label={t({ id: 'bookings.premium.copy', message: 'Copy' })}
            size="small"
            variant="control"
            alignSelf="auto"
            onPress={() => copied(p.onCopy(p.address ?? ''))}
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
            exiting={!reduced && p.leaving[view.id] === 'add' ? SLIDE_OUT : exitTransition(reduced)}
            {...(reduced ? {} : { layout: layoutTransition(false) })}
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
      {/* The quieter ways in, as rows on one card: typing it in, and a code from the inbox. */}
      <ListCard>
        <Row
          title={t({ id: 'bookings.add.byHand', message: 'Or type it in by hand' })}
          leading={<StickerIcon name="check" size={30} tilt={-6} />}
          trailing={<Icon name="forward" size={16} color={th.color.muted} />}
          onPress={p.onTypeIn}
          testID="bookings-add-by-hand"
        />
        <Row
          title={t({ id: 'bookings.add.linkCode', message: 'Got a code? Link your email' })}
          leading={<StickerIcon name="lock" size={30} tilt={6} />}
          trailing={<Icon name="forward" size={16} color={th.color.muted} />}
          onPress={p.onLinkCode}
          testID="bookings-add-link-code"
        />
      </ListCard>
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
        largeTitle
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
  address: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingLeft: 16,
    paddingRight: 8,
  },
  addressText: { flex: 1, minWidth: 0, letterSpacing: 0 },
  // An address is written as it is (the mono face sets capitals by default).
  asWritten: { textTransform: 'none' },
});
