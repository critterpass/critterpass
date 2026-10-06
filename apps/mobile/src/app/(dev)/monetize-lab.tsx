import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { MONETIZE_SCENE_NAMES } from '@/features/monetize/dev/lab-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** The paywall (4e), boost (4b) and plan (4d) scenes, for review and shots. */
export default function MonetizeLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Monetize lab</Text>
        {MONETIZE_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() =>
              router.push({ pathname: '/(dev)/monetize-scene', params: { scene: name } })
            }
            testID={`monetize-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
