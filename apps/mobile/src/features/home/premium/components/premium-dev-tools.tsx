/**
 * The "Developer tools" link on the premium Home, in development builds only: Maestro flows reach
 * the `(dev)` screens by tapping it (testID `dev-tools-entry`), never `openLink`. It is the last
 * line of Home's scroll, after every card, so it never draws over content.
 */
import { Trans } from '@lingui/react/macro';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/ui/premium';

import { showsDevTools } from '../../dev-tools';

// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path.
const DEV_TOOLS_ROUTE = '/(dev)';

export function PremiumDevTools() {
  if (!showsDevTools()) return null;
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Link href={DEV_TOOLS_ROUTE} asChild>
        <Pressable testID="dev-tools-entry" style={{ paddingVertical: 8, opacity: 0.6 }}>
          <Text variant="caption" tone="muted">
            <Trans id="home.devTools">Developer tools</Trans>
          </Text>
        </Pressable>
      </Link>
    </View>
  );
}
