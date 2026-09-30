import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';
import { TYPE_LAB_PAGES } from '@/ui/text/dev/type-lab-rows';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** Label centring pages: every label component and text face in English, Vietnamese and Thai. */
export default function TypeLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Type lab</Text>
        {TYPE_LAB_PAGES.map((page) => (
          <ListCard
            key={page.id}
            title={page.id}
            chevron
            onPress={() =>
              router.push({ pathname: '/(dev)/type-scene', params: { page: page.id } })
            }
            testID={`type-lab-${page.id}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
