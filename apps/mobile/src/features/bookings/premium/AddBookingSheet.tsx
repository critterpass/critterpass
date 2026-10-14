/**
 * "Add a booking" (1.06): the sheet the wallet's `+` grows into. One choice, so half height and no
 * verb: forward an email (copies the crew's address), scan a ticket, or add one by hand. Nothing
 * is typed here, so it closes without asking. It is the native form sheet alone: no drawn morph
 * runs before or after it.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { guideCritterKind, LineIcon } from '@/features/trip';
import { CritterSticker, PressableScale, StickerIcon, Text, usePremiumTheme } from '@/ui/premium';
import type { StickerIconName } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { useWalletContext } from '../data/use-wallet-context';
import { useWalletGuide, WalletGuideProvider } from '../data/wallet-guide';
import { BOOKINGS_ROUTES } from '../routes';
import { leaveSheetThen } from './sheet-handoff';
import { useAddChannels } from './use-add-channels';

function Tile(props: {
  /** The tile's colour sticker (1.06: a chat bubble, a camera, a wallet). */
  readonly icon: StickerIconName;
  readonly label: string;
  /** Degrees the doodle leans. */
  readonly tilt: number;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  return (
    <PressableScale
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      testID={props.testID}
      style={{ flex: 1 }}
    >
      <View
        style={{
          height: 124,
          borderRadius: th.radius.cardRow,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
          alignItems: 'center',
          justifyContent: 'center',
          gap: th.space.gap10,
          paddingHorizontal: th.space.gap8,
        }}
      >
        <StickerIcon
          name={props.icon}
          size={52}
          tilt={props.tilt}
          // 1.06 draws the by-hand wallet in sun yellow, not the hub's mint.
          {...(props.icon === 'wallet' ? { color: th.accent.sun } : {})}
        />
        <Text variant="label" align="center" numberOfLines={2}>
          {props.label}
        </Text>
      </View>
    </PressableScale>
  );
}

/** Joins every character so the address only breaks where it must, never at its own dots. */
const WORD_JOINER = '\u2060';

/** The forward note with the crew's address set bold (1.06), kept whole on its line. */
function ForwardNote(props: { readonly address: string; readonly note: string }) {
  const at = props.note.indexOf(props.address);
  if (at < 0) {
    return (
      <Text variant="note" tone="inkSecondary" style={styles.note}>
        {props.note}
      </Text>
    );
  }
  return (
    <Text variant="note" tone="inkSecondary" style={styles.note}>
      {props.note.slice(0, at)}
      <Text variant="note" style={styles.address}>
        {[...props.address].join(WORD_JOINER)}
      </Text>
      {props.note.slice(at + props.address.length)}
    </Text>
  );
}

function Body() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const context = useWalletContext();
  const guide = useWalletGuide();
  const channels = useAddChannels(context);
  // A choice lowers the sheet first, then the next page pushes over the wallet. Scanning opens
  // the add page with the scanner up, so what was read shows there as it arrives.
  const then = (action: () => void) => () => leaveSheetThen(action);
  const scan = () => router.push({ pathname: BOOKINGS_ROUTES.add, params: { start: 'scan' } });
  return (
    <View style={{ gap: th.space.gap16, paddingBottom: th.space.gap16 }}>
      <View style={{ flexDirection: 'row', gap: th.space.gap10 }}>
        <Tile
          icon="chat"
          label={t({ id: 'bookings.premium.forwardAnEmail', message: 'Forward an email' })}
          tilt={-6}
          onPress={channels.forward}
          testID="bookings-add-forward"
        />
        <Tile
          icon="camera"
          label={t({ id: 'bookings.premium.scanATicket', message: 'Scan a ticket' })}
          tilt={5}
          onPress={then(scan)}
          testID="bookings-add-scan"
        />
        <Tile
          icon="wallet"
          label={t({ id: 'bookings.premium.byHand', message: 'Add by hand' })}
          tilt={-4}
          onPress={then(channels.byHand)}
          testID="bookings-add-hand"
        />
      </View>
      {channels.address === null ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: th.space.gap10 }}>
          <CritterSticker
            kind={guideCritterKind(guide.id)}
            name={guide.name}
            size={34}
            pose="point"
          />
          <ForwardNote
            address={channels.address}
            note={t({
              id: 'bookings.premium.forwardNote',
              message: `Forward to ${channels.address} and I'll file it.`,
            })}
          />
          <PressableScale
            onPress={channels.forward}
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'bookings.add.copy', message: 'Copy' })}
            testID="bookings-add-copy"
          >
            <LineIcon name="copy" size={18} color={th.color.muted} />
          </PressableScale>
        </View>
      )}
    </View>
  );
}

export function AddBookingSheet() {
  const { t } = useLingui();
  const context = useWalletContext();
  return (
    <WalletGuideProvider tripId={context.trip?.id ?? null}>
      <SheetScreen
        title={t({ id: 'bookings.addCard', message: 'Add a booking' })}
        cancelLabel={t({ id: 'common.confirm.cancel', message: 'Cancel' })}
        testID="bookings-add-sheet"
      >
        <Body />
      </SheetScreen>
    </WalletGuideProvider>
  );
}

const styles = StyleSheet.create({
  note: { flex: 1 },
  address: { fontWeight: '600' },
});
