import { useLingui } from '@lingui/react/macro';
import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';

function readAppVariant(): string {
  const raw: unknown = Constants.expoConfig?.extra?.appVariant;
  return typeof raw === 'string' ? raw : 'development';
}

export default function HomeScreen() {
  const { t } = useLingui();
  const appName = Constants.expoConfig?.name ?? 'Critterpass';
  const appVariant = readAppVariant();

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
});
