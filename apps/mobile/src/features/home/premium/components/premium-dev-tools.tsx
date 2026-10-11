/**
 * The "Developer tools" link at the foot of the premium Home, in development builds only: Maestro
 * flows reach the `(dev)` screens by tapping it (testID `dev-tools-entry`), never `openLink`.
 */
import { Trans } from '@lingui/react/macro';
import { Link } from 'expo-router';
import { Pressable } from 'react-native';

import { Text } from '@/ui/premium';

import { showsDevTools } from '../../dev-tools-entry';

// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path.
const DEV_TOOLS_ROUTE = '/(dev)';

export function PremiumDevTools() {
  if (!showsDevTools()) return null;
  return (
    <Link href={DEV_TOOLS_ROUTE} asChild>
      <Pressable
        testID="dev-tools-entry"
        style={{ paddingVertical: 8, opacity: 0.6, alignSelf: 'flex-start' }}
      >
        <Text variant="caption" tone="muted">
          <Trans id="home.devTools">Developer tools</Trans>
        </Text>
      </Pressable>
    </Link>
  );
}
