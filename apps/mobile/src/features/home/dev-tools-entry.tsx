/**
 * The "Developer tools" link on Home, in development builds only (the e2e-test build profile ships
 * that variant): Maestro flows reach the `(dev)` screens by tapping it (never `openLink`). Staging
 * testers and production never see it. It floats small above the tab bar so it is on screen in
 * every Home mode without moving the designed layout.
 */
import { Trans } from '@lingui/react/macro';
import Constants from 'expo-constants';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles } from '@/ui/theme';

// A route path, never rendered copy.
// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path.
const DEV_TOOLS_ROUTE = '/(dev)';

/** Staging and production builds hide the link; an unset variant is app.config's development. */
export function showsDevTools(): boolean {
  const raw: unknown = Constants.expoConfig?.extra?.appVariant;
  return raw !== 'staging' && raw !== 'production';
}

const useStyles = makeStyles((t) => ({
  root: { position: 'absolute', start: t.size.gutter },
  link: { paddingVertical: t.space['4'], opacity: 0.6 },
}));

export function DevToolsEntry({ bottom }: { readonly bottom: number }) {
  const styles = useStyles();
  // The (dev) route group is dropped from production exports; the link must not point at it there,
  // and staging builds go to testers, over whose Home it would sit.
  if (!showsDevTools()) return null;
  return (
    <View style={[styles.root, { bottom }]} pointerEvents="box-none">
      {/* Navigates by route string, never by importing from (dev): that would bundle it. */}
      <Link href={DEV_TOOLS_ROUTE} asChild>
        <Pressable testID="dev-tools-entry" style={styles.link}>
          <Text variant="caption">
            <Trans id="home.devTools">Developer tools</Trans>
          </Text>
        </Pressable>
      </Link>
    </View>
  );
}
