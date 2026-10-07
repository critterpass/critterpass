import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { HELP_SCENE_NAMES } from '@/features/help/dev/lab-scenes';
import { HELP_ROUTES } from '@/features/help/routes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** The help centre (3p-1…3p-3 and their states), and the real hub, for review and shots. */
export default function HelpLab() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
      <Stack gap="8">
        <Text variant="h2">Help lab</Text>
        <ListCard
          title="Open the real help centre"
          chevron
          onPress={() => router.push(HELP_ROUTES.hub)}
          testID="help-lab-live"
        />
        {[...HELP_SCENE_NAMES, 'shake-wallet', 'shake-chat', 'sos-map-no-pack'].map((name) => (
          <ListCard
            key={name}
            title={name}
            chevron
            onPress={() => router.push({ pathname: '/(dev)/help-scene', params: { scene: name } })}
            testID={`help-lab-${name}`}
          />
        ))}
      </Stack>
    </ScrollView>
  );
}
