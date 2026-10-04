import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { SEARCH_LAB_SCENES } from '@/features/explore/search/dev/lab-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/**
 * Search (7d-1…7d-4, 7i-2) over Bali fixtures, for review and screenshots. With a `scene` param it
 * shows that scene full screen.
 */
export default function SearchLab() {
  const { scene } = useLocalSearchParams<{ scene?: string }>();
  const render = typeof scene === 'string' ? SEARCH_LAB_SCENES[scene] : undefined;
  if (render !== undefined) return render();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Search lab</Text>
        {Object.keys(SEARCH_LAB_SCENES).map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() => router.push({ pathname: '/(dev)/search-lab', params: { scene: name } })}
            testID={`search-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
