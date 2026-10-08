/**
 * A booking route whose row is not on the phone: the loading state while the wallet reads, else
 * the booking was deleted or is not shared with this member. Both keep the way back to Bookings.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { useLocale } from '@/lib/i18n/use-locale';
import { ScreenLoading } from '@/ui/states/ScreenLoading';
import { ScreenMissing } from '@/ui/states/ScreenMissing';

import { BOOKINGS_ROUTES } from '../routes';

export function BookingMissing({ loaded }: { readonly loaded: boolean }) {
  const { t } = useLingui();
  const locale = useLocale();
  const backLabel = upper(t({ id: 'bookings.back', message: 'Bookings' }), locale);
  if (!loaded) {
    return (
      <ScreenLoading
        backLabel={backLabel}
        fallback={BOOKINGS_ROUTES.wallet}
        label={t({ id: 'bookings.loading', message: 'Loading your bookings' })}
        testID="bookings-detail-loading"
      />
    );
  }
  return (
    <ScreenMissing
      backLabel={backLabel}
      fallback={BOOKINGS_ROUTES.wallet}
      title={t({ id: 'bookings.missing.title', message: 'Not in the wallet' })}
      line={t({
        id: 'bookings.missing.line',
        message: 'This booking was deleted, or it is not shared with you.',
      })}
      action={{
        label: t({ id: 'bookings.missing.back', message: 'Back to bookings' }),
        onPress: () => router.dismissTo(BOOKINGS_ROUTES.wallet),
      }}
      testID="bookings-missing"
    />
  );
}
