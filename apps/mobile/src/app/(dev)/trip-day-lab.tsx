import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { TRIP_DAY_SCENE_NAMES } from '@/features/trip/hub/dev/lab-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** The trip hub (3k-1), the day-of screen (3k-2), the leave-by alarm (5b-3) and the offline card (3k-4), for review and shots. */
export default function TripDayLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Trip day lab</Text>
        {TRIP_DAY_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() =>
              router.push({ pathname: '/(dev)/trip-day-scene', params: { scene: name } })
            }
            testID={`trip-day-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
