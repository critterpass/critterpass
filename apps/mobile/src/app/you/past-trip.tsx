import { t } from '@lingui/core/macro';
import { useLocalSearchParams } from 'expo-router';

import { PastTripScreen } from '@/features/you/history/past-trip-screen';
import { PastTripPremiumView } from '@/features/you/premium/history/past-trip-premium-view';
import { confirmAlert } from '@/ui/premium/shell';

function useTripId(): { readonly id?: string } {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return typeof id === 'string' && id.length > 0 ? { id } : {};
}

function askRemove(): Promise<boolean> {
  return confirmAlert({
    title: t({ id: 'you.pastTrip.removeTitle', message: 'Remove this trip?' }),
    message: t({
      id: 'you.pastTrip.removeLine',
      message: 'Its stamp leaves your passport. You can add the trip again later.',
    }),
    confirm: t({ id: 'you.pastTrip.removeConfirm', message: 'Remove' }),
    cancel: t({ id: 'you.premium.pastTrip.keep', message: 'Keep it' }),
  });
}

export default function PastTripRoute() {
  return <PastTripScreen {...useTripId()} View={PastTripPremiumView} askRemove={askRemove} />;
}
