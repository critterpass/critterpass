import { rideProviderSchema } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useLocalSearchParams } from 'expo-router';

import { LogRideSheet } from '@/features/bookings/getting-around/LogRideSheet';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

type Params = {
  tripId?: string;
  legRef?: string;
  provider?: string;
  currency?: string;
  quoteId?: string;
  attendees?: string;
};

/** LOG IT: the ride on its leg and, with an amount, a split crew expense. */
export default function LogRideRoute() {
  const { t } = useLingui();
  const params = useLocalSearchParams<Params>();
  const provider = rideProviderSchema.safeParse(params.provider);
  return (
    <Sheet
      detents={['fit']}
      title={t({ id: 'suppliers.log.title', message: 'Log the ride' })}
      testID="supplier-log-ride-sheet"
    >
      <SheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        <LogRideSheet
          params={{
            tripId: params.tripId ?? '',
            legRef: params.legRef ?? '',
            provider: provider.success ? provider.data : 'taxi',
            currency: params.currency ?? '',
            attendees: (params.attendees ?? '').split(',').filter((id) => id !== ''),
            quoteId: params.quoteId,
          }}
        />
      </SheetScrollView>
    </Sheet>
  );
}
