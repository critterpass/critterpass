import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { EXPLORE_LAB_SCENE_NAMES } from '@/features/explore/dev/lab-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** Explore screens (the guide 7g-3, the place page 7e, the places map 7c, 3b-8 and their states) over fixtures, for review and shots. */
export default function BookingsLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Explore lab</Text>
        {EXPLORE_LAB_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() =>
              router.push({ pathname: '/(dev)/explore-scene', params: { scene: name } })
            }
            testID={`explore-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
