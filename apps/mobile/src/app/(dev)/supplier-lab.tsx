import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { usePlaceSearch } from '@/data/places/usePlaceSearch';
import { useLiveRows } from '@/features/bookings/data/live-rows';
import { useWalletContext } from '@/features/bookings/data/use-wallet-context';
import { SUPPLIER_LAB_SCENE_NAMES } from '@/features/bookings/supplier/dev/lab-scenes';
import {
  gettingAroundRoute,
  offerRoute,
  vendorDraftRoute,
  vendorMessagesRoute,
} from '@/features/bookings/supplier/routes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

// A place on the plan, else the first place a catalogue search finds (the demo crew's plan has
// none).
const PLACE_SQL = `SELECT p.id, p.name
    FROM trips t LEFT JOIN plan_items pi ON pi.trip_id = t.id
    LEFT JOIN pois p ON p.id = pi.poi_id
   WHERE t.id = ? ORDER BY p.id IS NULL, pi.starts_at LIMIT 1`;
const PLACE_TABLES = ['plan_items', 'pois', 'trips'];

/**
 * Supplier cards, booking and cancel sheets, Getting around (3h-3) and vendor messages: the live
 * screens on this account's trip first, then every designed and undesigned state as a scene.
 */
export default function SupplierLab() {
  const { trip } = useWalletContext();
  const tripId = trip?.id ?? null;
  const planned = useLiveRows<{
    id: string | null;
    name: string | null;
    destination_id: string | null;
  }>(PLACE_SQL, tripId === null ? null : [tripId], PLACE_TABLES).rows[0];
  // Any catalogue place will do for a live check (the demo destination has none of its own).
  const search = usePlaceSearch({ limit: 1 });
  const found = search.places[0];
  const place =
    planned?.id && planned.name
      ? { id: planned.id, name: planned.name }
      : found
        ? { id: found.id, name: found.name }
        : undefined;
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
        <ListCard
          title={
            tripId === null
              ? 'Live getting around (needs a trip)'
              : 'Live getting around on this trip'
          }
          chevron
          onPress={() => {
            if (tripId !== null) router.push(gettingAroundRoute({ tripId }));
          }}
          testID="supplier-lab-live-around"
        />
        <ListCard
          title={
            place === undefined
              ? 'Live message to a place (needs a planned place)'
              : `Live message to ${place.name}`
          }
          chevron
          onPress={() => {
            if (tripId !== null && place !== undefined) {
              router.push(
                vendorDraftRoute({
                  tripId,
                  vendorKind: 'poi',
                  vendorId: place.id,
                  vendorName: place.name,
                  intent: 'ask',
                  text: `Hi ${place.name}, are you open tomorrow evening for 6 people?`,
                }),
              );
            }
          }}
          testID="supplier-lab-live-draft"
        />
        <ListCard
          title="Live messages to places"
          chevron
          onPress={() => {
            if (tripId !== null) router.push(vendorMessagesRoute(tripId));
          }}
          testID="supplier-lab-live-messages"
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
