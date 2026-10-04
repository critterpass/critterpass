import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { PLAN_IDEAS_SCENE_NAMES } from '@/features/plan/ideas/dev/lab-scenes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** Add to plan (7f-1), Ideas (7f-2), placing them (7h-6) and the review (7h-7), for shots. */
export default function PlanIdeasLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Plan ideas lab</Text>
        {PLAN_IDEAS_SCENE_NAMES.map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() =>
              router.push({ pathname: '/(dev)/plan-ideas-scene', params: { scene: name } })
            }
            testID={`plan-ideas-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
