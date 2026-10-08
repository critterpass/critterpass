/**
 * Past bookings (undesigned; list cards): everything that has ended or was cancelled, most recent
 * first, each opening its detail. The list is virtualised (a crew that travels often has years of
 * them). The screen reads the same wallet rows as the stack.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { memo, useCallback } from 'react';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { ListCard } from '@/ui/cards/ListCard';
import { Icon } from '@/ui/icons/Icon';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { WalletBooking } from '../data/model';
import { useWallet } from '../data/use-wallet';
import { useWalletContext } from '../data/use-wallet-context';
import { zoneOf } from '../format';
import { bookingRoute, BOOKINGS_ROUTES } from '../routes';
import { useDeckMeta } from './deck-meta';
import { WalletGuideProvider } from '../data/wallet-guide';

const useStyles = makeStyles((t) => ({
  head: { gap: t.space['16'], paddingBottom: t.space['16'] },
  gap: { height: t.space['8'] },
}));

const ArchiveRow = memo(function ArchiveRow(props: {
  readonly booking: WalletBooking;
  readonly subtitle: string;
  readonly onOpen: (id: string) => void;
}) {
  const { booking, onOpen } = props;
  const open = useCallback(() => onOpen(booking.id), [onOpen, booking.id]);
  return (
    <ListCard
      title={booking.title}
      subtitle={props.subtitle}
      leading={<Icon name={booking.icon} size={28} decorative />}
      tone={booking.status === 'cancelled' ? 'sunken' : 'raised'}
      onPress={open}
      testID={`bookings-archive-${booking.id}`}
    />
  );
});

function RowGap() {
  const styles = useStyles();
  return <View style={styles.gap} />;
}

export interface ArchiveViewProps {
  readonly past: readonly WalletBooking[];
  readonly tz?: string | undefined;
  readonly onOpen: (id: string) => void;
}

export function ArchiveView({ past, tz, onOpen }: ArchiveViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const meta = useDeckMeta();
  return (
    <Scaffold variant="dark" clearTabBar testID="bookings-archive">
      <FlashList
        data={past}
        keyExtractor={(booking) => booking.id}
        contentContainerStyle={{
          paddingHorizontal: theme.size.gutter,
          paddingTop: theme.space['8'],
          paddingBottom: theme.space['32'],
        }}
        ListHeaderComponent={
          <View style={styles.head}>
            <BackEyebrow
              label={upper(t({ id: 'bookings.back', message: 'Bookings' }), locale)}
              fallback={BOOKINGS_ROUTES.wallet}
            />
            <Text variant="h1" accessibilityRole="header">
              {upper(t({ id: 'bookings.archive.title', message: 'Past bookings' }), locale)}
            </Text>
            {past.length === 0 ? (
              <Text variant="body" color={theme.semantic.text.secondary}>
                {t({ id: 'bookings.archive.empty', message: 'Nothing has ended yet.' })}
              </Text>
            ) : null}
          </View>
        }
        ItemSeparatorComponent={RowGap}
        renderItem={({ item }) => (
          <ArchiveRow booking={item} subtitle={meta(item, zoneOf(item.tz, tz))} onOpen={onOpen} />
        )}
      />
    </Scaffold>
  );
}

const openBooking = (id: string) => router.push(bookingRoute(id));

export function ArchiveScreen() {
  const context = useWalletContext();
  const wallet = useWallet(context.trip?.id ?? null, context.uid);
  return (
    <WalletGuideProvider tripId={context.trip?.id ?? null}>
      <ArchiveView past={wallet.past} tz={context.trip?.tz ?? undefined} onOpen={openBooking} />
    </WalletGuideProvider>
  );
}
