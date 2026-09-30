import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { PLAN_EDIT_LAB_SCENE_NAMES } from '@/features/plan/day/dev/lab-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** Plan editing screens (3e-2, 3g-2 and their states) over fixed fixtures, for review and shots. */
export default function PlanEditLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Plan editing lab</Text>
        {PLAN_EDIT_LAB_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() =>
              router.push({ pathname: '/(dev)/plan-edit-scene', params: { scene: name } })
            }
            testID={`plan-edit-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
