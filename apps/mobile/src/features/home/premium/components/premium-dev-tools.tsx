/**
 * The "Developer tools" link on the premium Home, in development builds only: Maestro flows reach
 * the `(dev)` screens by tapping it (testID `dev-tools-entry`), never `openLink`. Like the current
 * Home's link it floats small at the foot of the page, above the tab bar, so it is on screen in every
 * Home mode without scrolling and without moving the designed layout.
 */
import { Trans } from '@lingui/react/macro';
import { Link } from 'expo-router';
import { Platform, Pressable, View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';

import { showsDevTools } from '../../dev-tools-entry';

// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path.
const DEV_TOOLS_ROUTE = '/(dev)';

export function PremiumDevTools() {
  const t = usePremiumTheme();
  if (!showsDevTools()) return null;
  // iOS draws the page under the floating glass tab bar; Android's Material bar sits below it.
  const bottom = Platform.OS === 'ios' ? t.space.tabBarClearance : t.space.gap8;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', start: t.space.gutter, bottom }}>
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
