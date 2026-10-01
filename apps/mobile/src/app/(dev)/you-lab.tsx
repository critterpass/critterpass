import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { YOU_SCENE_NAMES } from '@/features/you/dev/lab-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** The profile (3n-1) and Settings (3n-2, 3n-6), for review and shots. */
export default function YouLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">You lab</Text>
        {YOU_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() => router.push({ pathname: '/(dev)/you-scene', params: { scene: name } })}
            testID={`you-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
