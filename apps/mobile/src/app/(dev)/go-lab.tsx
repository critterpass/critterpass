import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { GO_SCENE_NAMES } from '@/features/go/dev/go-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** The GO preview, one scene per state, for review and shots. */
export default function GoLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">GO lab</Text>
        {GO_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() => router.push({ pathname: '/(dev)/go-scene', params: { scene: name } })}
            testID={`go-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
