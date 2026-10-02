import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import {
  FLIGHT_SCENE_NAMES,
  FLIGHT_SCENES,
} from '@/features/trip/disruptions/flight/dev/flight-scenes';
import {
  FORECAST_SCENE_NAMES,
  FORECAST_SCENES,
} from '@/features/trip/disruptions/forecast/dev/forecast-scenes';
import {
  LATE_SCENE_NAMES,
  LATE_SCENE_PLACE,
  lateScenes,
} from '@/features/trip/disruptions/late/dev/late-scenes';
import {
  STORM_SCENE_NAMES,
  STORM_SCENES,
} from '@/features/trip/disruptions/storm/dev/storm-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';
import { CpMap } from '@/ui/map/CpMap';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const LATE_SCENES = lateScenes(() => (
  <CpMap
    places={[{ ...LATE_SCENE_PLACE, iconKey: 'pin', categoryLabel: '' }]}
    initialCenter={[LATE_SCENE_PLACE.lng, LATE_SCENE_PLACE.lat]}
  />
));
const SCENES = { ...FLIGHT_SCENES, ...LATE_SCENES, ...FORECAST_SCENES, ...STORM_SCENES };
const NAMES = [
  ...FLIGHT_SCENE_NAMES,
  ...LATE_SCENE_NAMES,
  ...FORECAST_SCENE_NAMES,
  ...STORM_SCENE_NAMES,
];

/** Disruption screens (3k-5, 3k-7, 3k-8, 3k-9) with fixed data per state: the list, or one scene full screen. */
export default function DisruptionLab() {
  const { scene } = useLocalSearchParams<{ scene?: string }>();
  const render = typeof scene === 'string' ? SCENES[scene] : undefined;
  if (render !== undefined) return render();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Disruptions lab</Text>
        {NAMES.map((name) => (
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
