import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { ALBUM_SCENE_NAMES } from '@/features/album/dev/album-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** The album (3m-2), the photo viewer and the postcard (3m-9) in every state, for review and shots. */
export default function AlbumLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Album lab</Text>
        {ALBUM_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() => router.push({ pathname: '/(dev)/album-scene', params: { scene: name } })}
            testID={`album-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
