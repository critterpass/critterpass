import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { PLAN_VIEWS_SCENE_NAMES } from '@/features/plan/overview/dev/lab-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** Plan overview (3e-1), review changes (3e-3) and the map and calendar views, for review and shots. */
export default function PlanViewsLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Plan views lab</Text>
        {PLAN_VIEWS_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() =>
              router.push({ pathname: '/(dev)/plan-views-scene', params: { scene: name } })
            }
            testID={`plan-views-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
