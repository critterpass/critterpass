/**
 * A booking route whose row is not on the phone: skeleton while the wallet loads, else the
 * booking was deleted or is not shared with this member (undesigned; the empty state).
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { EmptyState } from '@/ui/states/EmptyState';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { makeStyles } from '@/ui/theme';

import { BOOKINGS_ROUTES } from '../routes';

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, paddingTop: t.space['32'], gap: t.space['16'] },
}));

export function BookingMissing({ loaded }: { readonly loaded: boolean }) {
  const styles = useStyles();
  const { t } = useLingui();
  return (
    <Scaffold variant="dark" testID={loaded ? 'bookings-missing' : 'bookings-detail-loading'}>
      <View style={styles.content}>
        {loaded ? (
          <EmptyState
            guide="tokek"
            guideName={GUIDE_STICKERS.tokek.name}
            title={t({ id: 'bookings.missing.title', message: 'Not in the wallet' })}
            line={t({
              id: 'bookings.missing.line',
              message: 'This booking was deleted, or it is not shared with you.',
            })}
            action={{
              label: t({ id: 'bookings.missing.back', message: 'Back to bookings' }),
              onPress: () => router.replace(BOOKINGS_ROUTES.wallet),
            }}
          />
        ) : (
          <Skeleton
            preset="card"
            repeat={2}
            label={t({ id: 'bookings.loading', message: 'Loading your bookings' })}
          />
        )}
      </View>
    </Scaffold>
  );
}
