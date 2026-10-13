import { router } from 'expo-router';
import { ScrollView } from 'react-native';

import { HELP_ROUTES } from '@/features/help/routes';
import { Stack, Text } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** Shake to report, and the real help centre. */
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
        {['shake-report', 'shake-chat'].map((name) => (
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
