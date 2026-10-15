/**
 * The last-resort recovery page, shown only when the premium "Something broke" sheet itself throws:
 * plain React Native views with the light palette read straight from the tokens, nothing from a
 * theme provider or the kit, so it cannot fail the way the sheet did. Go back (when there is a page behind), Go home, and Try again where the
 * boundary can render its layout again.
 */
import { t } from '@lingui/core/macro';
import type { ErrorBoundaryProps } from 'expo-router';
import { router } from 'expo-router';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- the page draws raw text on purpose: the kit's Text is what may have failed
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { premium } from '@cp/design-tokens';

import { canGoBack, goBackOr } from '@/lib/navigation/back';

const HOME_HREF = '/';

function Choice({
  label,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.choice} testID={testID}>
      <Text style={styles.choiceText}>{label}</Text>
    </Pressable>
  );
}

export function PlainRecovery({ retry }: { readonly retry?: ErrorBoundaryProps['retry'] }) {
  // The imperative router throws until navigation has rendered once: nothing to go back to then.
  let back: boolean;
  try {
    back = canGoBack();
  } catch {
    back = false;
  }
  return (
    <View style={styles.root} testID="shell-error">
      <Text accessibilityRole="header" style={styles.title}>
        {t({ id: 'common.shell.errorTitle', message: 'That didn’t load' })}
      </Text>
      {back ? (
        <Choice
          label={t({ id: 'common.shell.errorBack', message: 'Go back' })}
          onPress={() => goBackOr(HOME_HREF)}
          testID="shell-error-back"
        />
      ) : null}
      <Choice
        label={t({ id: 'common.shell.errorHome', message: 'Go home' })}
        onPress={() => router.replace(HOME_HREF)}
        testID="shell-error-home"
      />
      {retry === undefined ? null : (
        <Choice
          label={t({ id: 'common.shell.errorRetry', message: 'Try again' })}
          onPress={() => void retry()}
          testID="shell-error-retry"
        />
      )}
    </View>
  );
}

const light = premium.modes.light.color;
const { title, button } = premium.type;
const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    padding: premium.space.gutter,
    gap: premium.space.gap12,
    backgroundColor: light.ground,
  },
  title: {
    fontSize: title.size,
    fontWeight: title.weight,
    color: light.ink,
    marginBottom: premium.space.gap8,
  },
  choice: {
    minHeight: premium.size.button,
    borderRadius: premium.radius.button,
    justifyContent: 'center',
    backgroundColor: light.ink,
  },
  choiceText: {
    fontSize: button.size,
    fontWeight: button.weight,
    color: light.onInk,
    textAlign: 'center',
  },
});
