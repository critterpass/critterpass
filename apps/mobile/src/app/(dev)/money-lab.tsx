import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { MONEY_LAB_SCENE_NAMES } from '@/features/money/dev/lab-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** Money screens (3i-1…3i-6 and their states) over the Bali Six fixtures, for review and shots. */
export default function MoneyLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Money lab</Text>
        {MONEY_LAB_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() => router.push({ pathname: '/(dev)/money-scene', params: { scene: name } })}
            testID={`money-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
