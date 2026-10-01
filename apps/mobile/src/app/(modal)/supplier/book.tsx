import { useLingui } from '@lingui/react/macro';
import { useLocalSearchParams } from 'expo-router';

import { BookingScreen } from '@/features/bookings/supplier/BookingScreen';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

type Params = {
  tripId?: string;
  product?: string;
  title?: string;
  date?: string;
  currency?: string;
  stableId?: string;
};

/** Booking a Viator activity in the app: hold, traveller, Viator's payment form, result. */
export default function SupplierBookRoute() {
  const { t } = useLingui();
  const params = useLocalSearchParams<Params>();
  return (
    <Sheet
      detents={['large']}
      title={t({ id: 'suppliers.book.title', message: 'Book with Viator' })}
      testID="supplier-book-sheet"
    >
      <SheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      >
        <BookingScreen
          params={{
            tripId: params.tripId ?? '',
            product: params.product ?? '',
            title: params.title ?? '',
            date: params.date ?? '',
            currency: params.currency ?? 'USD',
            stableId: params.stableId,
          }}
        />
      </SheetScrollView>
    </Sheet>
  );
}
