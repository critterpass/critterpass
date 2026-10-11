/**
 * "Add a booking" (1.06): the sheet the wallet's `+` grows into. One choice, so half height and no
 * verb: forward an email (copies the crew's address), scan a ticket, or add one by hand. Nothing
 * is typed here, so it closes without asking.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { guideCritterKind, IconTile, LineIcon, turn, type LineIconName } from '@/features/trip';
import { CritterSticker, PressableScale, Text, usePremiumTheme } from '@/ui/premium';
import { SheetScreen } from '@/ui/premium/shell';

import { useWalletContext } from '../data/use-wallet-context';
import { useWalletGuide, WalletGuideProvider } from '../data/wallet-guide';
import { useAddChannels } from './use-add-channels';

function Tile(props: {
  readonly icon: LineIconName;
  readonly bg: string;
  readonly color: string;
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
        <View style={{ transform: [turn(props.tilt)] }}>
          <IconTile name={props.icon} bg={props.bg} color={props.color} size={52} />
        </View>
        <Text variant="label" align="center" numberOfLines={2}>
          {props.label}
        </Text>
      </View>
    </PressableScale>
  );
}

function Body() {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const context = useWalletContext();
  const guide = useWalletGuide();
  const channels = useAddChannels(context);
  // A choice leaves the sheet first, so the next screen or the scanner opens over the wallet.
  const then = (action: () => void) => () => {
    router.back();
    action();
  };
  return (
    <View style={{ gap: th.space.gap16, paddingBottom: th.space.gap16 }}>
      <View style={{ flexDirection: 'row', gap: th.space.gap10 }}>
        <Tile
          icon="mail"
          bg={th.color.status.rain.bg}
          color={th.color.status.rain.text}
          label={t({ id: 'bookings.premium.forwardAnEmail', message: 'Forward an email' })}
          tilt={-6}
          onPress={channels.forward}
          testID="bookings-add-forward"
        />
        <Tile
          icon="scan"
          bg={th.color.status.voteOpen.bg}
          color={th.color.status.voteOpen.text}
          label={t({ id: 'bookings.premium.scanATicket', message: 'Scan a ticket' })}
          tilt={5}
          onPress={then(channels.scan)}
          testID="bookings-add-scan"
        />
        <Tile
          icon="receipt"
          bg={th.color.status.maybe.bg}
          color={th.color.status.maybe.text}
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
          <Text variant="note" tone="inkSecondary" style={{ flex: 1 }}>
            {t({
              id: 'bookings.premium.forwardNote',
              message: `Forward to ${channels.address} and I'll file it.`,
            })}
          </Text>
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
