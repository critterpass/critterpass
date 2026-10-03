import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';
import { PLANNING_MAP_SCENES } from '@/ui/map/planning/dev/lab-scenes';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const SCENES: Readonly<Record<string, () => React.ReactNode>> = PLANNING_MAP_SCENES;

/**
 * The planning kit: the trip map with 500 places as layers and the map sheet, the frame budget
 * run, and the planning components. With a `scene` param it shows that scene full screen.
 */
export default function PlanningMapLab() {
  const { scene } = useLocalSearchParams<{ scene?: string }>();
  const render = typeof scene === 'string' ? SCENES[scene] : undefined;
  if (render !== undefined) return render();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Planning kit lab</Text>
        {Object.keys(SCENES).map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() =>
              router.push({ pathname: '/(dev)/planning-map-lab', params: { scene: name } })
            }
            testID={`planning-map-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
