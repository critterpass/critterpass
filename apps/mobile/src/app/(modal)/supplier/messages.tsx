import { useLingui } from '@lingui/react/macro';
import { useLocalSearchParams } from 'expo-router';

import { VendorMessagesScreen } from '@/features/bookings/supplier/VendorScreens';
import { Sheet } from '@/ui/sheet/Sheet';
import { SheetScrollView } from '@/ui/sheet/SheetScrollView';

/** The trip's messages to places: drafts to send, sent and waiting, and the places' replies. */
export default function VendorMessagesRoute() {
  const { t } = useLingui();
  const { tripId } = useLocalSearchParams<{ tripId?: string }>();
  return (
    <Sheet
      detents={['large']}
      title={t({ id: 'suppliers.vendor.listTitle', message: 'Messages to places' })}
      testID="vendor-messages-sheet"
    >
      <SheetScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        <VendorMessagesScreen tripId={tripId ?? ''} />
      </SheetScrollView>
    </Sheet>
  );
}
