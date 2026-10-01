import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { CRITTER_SCENE_NAMES } from '@/features/critters/dev/lab-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** The hatch (3l-1), the PASS tab Critterdex (3l-2), sets (3l-8), critter detail (3l-3), encounters (3l-4…3l-6, 3l-10) and legendaries (3l-9), for review and shots. */
export default function CrittersLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Critters lab</Text>
        {CRITTER_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() =>
              router.push({ pathname: '/(dev)/critters-scene', params: { scene: name } })
            }
            testID={`critters-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
