import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import {
  FLIGHT_SCENE_NAMES,
  FLIGHT_SCENES,
} from '@/features/trip/disruptions/flight/dev/flight-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** Disruption screens (3k-5) with fixed data per state: the list, or one scene full screen. */
export default function DisruptionLab() {
  const { scene } = useLocalSearchParams<{ scene?: string }>();
  const render = typeof scene === 'string' ? FLIGHT_SCENES[scene] : undefined;
  if (render !== undefined) return render();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Disruptions lab</Text>
        {FLIGHT_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() =>
              router.push({ pathname: '/(dev)/disruption-lab', params: { scene: name } })
            }
            testID={`disruption-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
