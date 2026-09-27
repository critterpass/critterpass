import { Trans, useLingui } from '@lingui/react/macro';
import Constants from 'expo-constants';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

function readAppVariant(): string {
  const raw: unknown = Constants.expoConfig?.extra?.appVariant;
  return typeof raw === 'string' ? raw : 'development';
}

// A route string, not copy.
// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, never rendered copy.
const DEV_TOOLS_ROUTE = '/(dev)';

export default function HomeScreen() {
  const { t } = useLingui();
  const appName = Constants.expoConfig?.name ?? 'Critterpass';
  const appVariant = readAppVariant();
  // Never in production: Metro still bundles this route file (it isn't under (dev)), but the
  // (dev) route group it links to is dropped from a production export
  // (tools/scripts/check-release-bundle.ts), so the entry itself must also stay hidden there
  // rather than linking to a route that no longer exists.
  const showDevTools = appVariant !== 'production';

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {appName}
      </Text>
      <Text
        accessibilityLabel={t({
          id: 'common.devHome.buildVariantLabel',
          // The Lingui macro reads `${{ variant: appVariant }}` at compile time to build an ICU
          // placeholder named "variant" filled from the local `appVariant` value — never
          // stringified as a plain template literal (the macro replaces this whole call before it
          // reaches runtime), which is what these two typed-lint rules assume of `${object}`.
          // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
          message: `Build variant: ${{ variant: appVariant }}`,
        })}
        style={styles.variant}
      >
        {appVariant}
      </Text>
      {showDevTools ? (
        // Navigates by route string, never by importing from (dev): Metro drops that route group
        // from a production bundle, and an import would pull it back in for every variant
        // (docs/system-architecture.md §3, tools/scripts/check-release-bundle.ts).
        <Link href={DEV_TOOLS_ROUTE} asChild>
          <Pressable testID="dev-tools-entry">
            {/* No explicit accessibilityLabel: Text's rendered content is already its accessible name. */}
            <Text style={styles.devToolsEntry}>
              <Trans id="common.devHome.devToolsEntry">Developer tools</Trans>
            </Text>
          </Pressable>
        </Link>
      ) : null}
    </View>
  );
}

// Dev-client verification screen, not a designed one: it stays on the platform default text size
// (no fontSize literal) rather than reaching for @cp/design-tokens, which route files may not
// import directly (docs/system-architecture.md §3: apps/mobile/src/app only imports features, ui,
// motion, data, lib, domain, i18n — styling tokens flow through the ui/feature layers).
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontWeight: 'bold',
  },
  variant: {
    opacity: 0.7,
  },
  devToolsEntry: {
    marginTop: 16,
    textDecorationLine: 'underline',
  },
});
