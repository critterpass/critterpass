import { vendorIntentSchema } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useLocalSearchParams } from 'expo-router';

import { VendorDraftScreen } from '@/features/bookings/supplier/VendorScreens';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

type Params = {
  tripId?: string;
  vendorKind?: string;
  vendorId?: string;
  vendorName?: string;
  intent?: string;
  text?: string;
};

/** A message to a place: the exact text, then the desk sends it or the traveller's WhatsApp does. */
export default function VendorDraftRoute() {
  const { t } = useLingui();
  const params = useLocalSearchParams<Params>();
  const intent = vendorIntentSchema.safeParse(params.intent);
  return (
    <Sheet
      detents={['large']}
      title={t({ id: 'suppliers.vendor.draftTitle', message: 'Message to a place' })}
      testID="vendor-draft-sheet"
    >
      <SheetScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      >
        <VendorDraftScreen
          params={{
            tripId: params.tripId ?? '',
            vendorKind: params.vendorKind === 'provider' ? 'provider' : 'poi',
            vendorId: params.vendorId ?? '',
            vendorName: params.vendorName ?? '',
            intent: intent.success ? intent.data : 'other',
            text: params.text ?? '',
          }}
        />
      </SheetScrollView>
    </Sheet>
  );
}
