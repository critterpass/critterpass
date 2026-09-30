import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { GUIDE_LAB_SCENE_NAMES } from '@/features/guide/chat/dev/lab-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** Guide screens (3j-1, 4b-1, 3g-1, 3h-3 and their states) over fixed data, for review and shots. */
export default function GuideLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Guide lab</Text>
        {GUIDE_LAB_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() => router.push({ pathname: '/(dev)/guide-scene', params: { scene: name } })}
            testID={`guide-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
