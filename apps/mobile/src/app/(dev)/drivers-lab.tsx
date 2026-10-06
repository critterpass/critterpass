import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { useWalletContext } from '@/features/bookings/data/use-wallet-context';
import { driversRoute, type DriverScreen } from '@/features/drivers/shared/routes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

const SCREENS: readonly { readonly screen: DriverScreen; readonly label: string }[] = [
  { screen: 'index', label: 'Find a driver (6a-2)' },
  { screen: 'ask', label: 'Ask for me (6b-1)' },
  { screen: 'add', label: 'Add a driver (6c-1)' },
  { screen: 'check', label: "Couldn't read it (6c-3)" },
  { screen: 'compare', label: 'Compare the shortlist (6d-1)' },
  { screen: 'tours', label: 'Private tours (6f-1)' },
];

/** The driver screens on this account's current trip, live (no fixtures). */
export default function DriversLab() {
  const { trip } = useWalletContext();
  const tripId = trip?.id ?? null;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Find a driver</Text>
        {SCREENS.map(({ screen, label }) => (
          <ListCard
            key={screen}
            title={tripId === null ? `${label} (needs a trip)` : label}
            chevron
            onPress={() => {
              if (tripId !== null)
                router.push(
                  driversRoute(tripId, screen, screen === 'check' ? { unread: '1' } : {}),
                );
            }}
            testID={`drivers-lab-${screen}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
