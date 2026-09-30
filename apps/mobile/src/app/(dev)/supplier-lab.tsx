import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { useWalletContext } from '@/features/bookings/data/use-wallet-context';
import { SUPPLIER_LAB_SCENE_NAMES } from '@/features/bookings/supplier/dev/lab-scenes';
import { offerRoute } from '@/features/bookings/supplier/routes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/**
 * Supplier cards, booking and cancel sheets, Getting around (3h-3) and vendor messages: the live
 * screens on this account's trip first, then every designed and undesigned state as a scene.
 */
export default function SupplierLab() {
  const { trip } = useWalletContext();
  const tripId = trip?.id ?? null;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Supplier lab</Text>
        <ListCard
          title={tripId === null ? 'Live offer (needs a trip)' : 'Live offer on this trip'}
          chevron
          onPress={() => {
            if (tripId !== null)
              router.push(offerRoute({ tripId, name: 'Mount Batur sunrise trek' }));
          }}
          testID="supplier-lab-live-offer"
        />
        {SUPPLIER_LAB_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() =>
              router.push({ pathname: '/(dev)/supplier-scene', params: { scene: name } })
            }
            testID={`supplier-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
