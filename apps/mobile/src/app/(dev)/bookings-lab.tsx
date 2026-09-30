import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { BOOKINGS_LAB_SCENE_NAMES } from '@/features/bookings/dev/lab-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** Bookings screens (3h-1, 3h-2 and their states) over the Bali Six fixtures, for review and shots. */
export default function BookingsLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Bookings lab</Text>
        {BOOKINGS_LAB_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() =>
              router.push({ pathname: '/(dev)/bookings-scene', params: { scene: name } })
            }
            testID={`bookings-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
