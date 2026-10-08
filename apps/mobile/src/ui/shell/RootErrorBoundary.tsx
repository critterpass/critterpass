import { i18n } from '@lingui/core';
import { t } from '@lingui/core/macro';
import { I18nProvider } from '@lingui/react';
import type { ErrorBoundaryProps } from 'expo-router';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { sourceLocale } from '@cp/i18n';

import { canGoBack, goBackOr } from '@/lib/navigation/back';
import { clearSavedNavigation } from '@/lib/navigation/restore';
import { ThemeProvider } from '@/lib/theme';
import { ScreenJoltProvider } from '@/motion/patterns/thud';

import { PillButton } from '../buttons/PillButton';
import { Row } from '../layout/Row';
import { Stack as Column } from '../layout/Stack';
import { Scaffold } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { makeStyles, MIN_TOUCH_TARGET } from '../theme';

const HOME_HREF = '/';

const useErrorStyles = makeStyles((th) => ({
  panel: {
    marginTop: 'auto',
    backgroundColor: th.semantic.bg.raised,
    borderTopStartRadius: th.radius.sheetTop,
    borderTopEndRadius: th.radius.sheetTop,
    padding: th.size.gutter,
    paddingBottom: th.size.cta.bottom,
    gap: th.space['16'],
  },
  option: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.control,
    padding: th.space['14'],
    gap: th.space['4'],
  },
}));

function RecoveryPanel({ retry }: Pick<ErrorBoundaryProps, 'retry'>) {
  const styles = useErrorStyles();
  // The imperative router throws until navigation has rendered once, which is exactly when a render
  // error in the root layout's first pass reaches this boundary: there is nothing to go back to then.
  const options = [
    ...(canGoBack()
      ? [
          {
            key: 'back',
            title: t({ id: 'common.shell.errorBack', message: 'Go back' }),
            body: t({ id: 'common.shell.errorBackBody', message: 'Pick up where you were' }),
            onPress: () => goBackOr(HOME_HREF),
          },
        ]
      : []),
    {
      key: 'home',
      title: t({ id: 'common.shell.errorHome', message: 'Go home' }),
      body: t({ id: 'common.shell.errorHomeBody', message: 'Start again from your crews' }),
      onPress: () => router.replace(HOME_HREF),
    },
  ];

  return (
    <Scaffold edges={['top']}>
      <View style={styles.panel} testID="shell-error">
        <Text variant="eyebrow">
          {t({ id: 'common.shell.errorEyebrow', message: 'Something went sideways' })}
        </Text>
        <Text variant="h2" accessibilityRole="header">
          {t({ id: 'common.shell.errorTitle', message: 'That didn’t load' })}
        </Text>
        <Row gap="8" align="stretch">
          {options.map((option) => (
            <Pressable
              key={option.key}
              testID={`shell-error-${option.key}`}
              accessibilityRole="button"
              onPress={option.onPress}
              style={styles.option}
            >
              <Column gap="4">
                <Text variant="title">{option.title}</Text>
                <Text variant="bodySm">{option.body}</Text>
              </Column>
            </Pressable>
          ))}
        </Row>
        <PillButton
          label={t({ id: 'common.shell.errorRetry', message: 'Try again' })}
          onPress={() => void retry()}
          testID="shell-error-retry"
        />
      </View>
    </Scaffold>
  );
}

/**
 * The app's error boundary (undesigned; follows the 3i-4 "three ways forward" pattern): try again,
 * go back, or go home. Never shows the raw error. The root layout exports it for everything below
 * it, and the tabs, the trip stack and the modal group export it again, so a screen that fails in
 * one of them is contained there: the rest of the stack stays as it was, "Go back" returns to the
 * screen under the group and "Try again" renders only that group again.
 *
 * Expo Router renders it in place of the layout that exports it; in place of the root layout none
 * of the app's providers are above it, only Expo Router's own SafeAreaProvider. A boundary that
 * throws while rendering takes a release build down, so it mounts its own gesture root (its buttons
 * press through one), locale, theme settings and screen-jolt context. When the layout failed before
 * any locale was activated, it falls back to the source locale's own strings.
 *
 * It also drops the saved navigation state: that state still points at the screen that threw, and a
 * cold start inside the restore window would put the user straight back on this panel.
 */
export function RootErrorBoundary({ retry }: ErrorBoundaryProps) {
  useEffect(() => clearSavedNavigation(), []);
  if (!i18n.locale) i18n.loadAndActivate({ locale: sourceLocale, messages: {} });
  return (
    <GestureHandlerRootView style={rootStyles.root}>
      <I18nProvider i18n={i18n}>
        <ThemeProvider>
          <ScreenJoltProvider>
            <RecoveryPanel retry={retry} />
          </ScreenJoltProvider>
        </ThemeProvider>
      </I18nProvider>
    </GestureHandlerRootView>
  );
}

const rootStyles = StyleSheet.create({ root: { flex: 1 } });
