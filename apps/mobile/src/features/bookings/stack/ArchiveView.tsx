/**
 * Past bookings (undesigned; list cards): everything that has ended or was cancelled, most recent
 * first, each opening its detail. The screen reads the same wallet rows as the stack.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { ListCard } from '@/ui/cards/ListCard';
import { Icon } from '@/ui/icons/Icon';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { WalletBooking } from '../data/model';
import { useWallet } from '../data/use-wallet';
import { useWalletContext } from '../data/use-wallet-context';
import { zoneOf } from '../format';
import { bookingRoute } from '../routes';
import { useDeckMeta } from './deck-meta';
import { WalletGuideProvider } from '../data/wallet-guide';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, gap: t.space['16'], paddingTop: t.space['8'] },
}));

export interface ArchiveViewProps {
  readonly past: readonly WalletBooking[];
  readonly tz?: string | undefined;
  readonly onOpen: (id: string) => void;
}

export function ArchiveView({ past, tz, onOpen }: ArchiveViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const { t } = useLingui();
  const meta = useDeckMeta();
  return (
    <Scaffold variant="dark" testID="bookings-archive">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + theme.space['32'] },
        ]}
      >
        <BackEyebrow label={upper(t({ id: 'bookings.back', message: 'Bookings' }), locale)} />
        <Text variant="h1" accessibilityRole="header">
          {upper(t({ id: 'bookings.archive.title', message: 'Past bookings' }), locale)}
        </Text>
        {past.length === 0 ? (
          <Text variant="body" color={theme.semantic.text.secondary}>
            {t({ id: 'bookings.archive.empty', message: 'Nothing has ended yet.' })}
          </Text>
        ) : (
          <Stack gap="8">
            {past.map((booking) => (
              <ListCard
                key={booking.id}
                title={booking.title}
                subtitle={meta(booking, zoneOf(booking.tz, tz))}
                leading={<Icon name={booking.icon} size={28} decorative />}
                tone={booking.status === 'cancelled' ? 'sunken' : 'raised'}
                onPress={() => onOpen(booking.id)}
                testID={`bookings-archive-${booking.id}`}
              />
            ))}
          </Stack>
        )}
      </ScrollView>
    </Scaffold>
  );
}

export function ArchiveScreen() {
  const context = useWalletContext();
  const wallet = useWallet(context.trip?.id ?? null, context.uid);
  return (
    <WalletGuideProvider tripId={context.trip?.id ?? null}>
      <ArchiveView
        past={wallet.past}
        tz={context.trip?.tz ?? undefined}
        onOpen={(id) => router.push(bookingRoute(id))}
      />
    </WalletGuideProvider>
  );
}
