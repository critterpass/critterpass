import { useLingui } from '@lingui/react/macro';
import { useLocalSearchParams } from 'expo-router';

import { CancelSheet } from '@/features/bookings/supplier/CancelSheet';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

/** Cancelling a Viator booking: Viator's refund quote first, then the cancel. */
export default function SupplierCancelRoute() {
  const { t } = useLingui();
  const params = useLocalSearchParams<{ bookingId?: string; title?: string }>();
  return (
    <Sheet
      detents={['fit']}
      title={t({ id: 'suppliers.cancel.title', message: 'Cancel with Viator' })}
      testID="supplier-cancel-sheet"
    >
      <SheetScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <CancelSheet bookingId={params.bookingId ?? ''} title={params.title ?? ''} />
      </SheetScrollView>
    </Sheet>
  );
}
