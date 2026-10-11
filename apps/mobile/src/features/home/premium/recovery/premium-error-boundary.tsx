/**
 * The app's error boundaries with the premium "Something broke" sheet (3.20) when this run shows
 * the premium UI, and the current recovery page otherwise. The layouts export these in place of
 * `RootErrorBoundary` / `GroupErrorBoundary`. Like those, it mounts its own gesture root, locale
 * and theme (the layout that failed may have been the one providing them) and drops the saved
 * navigation. If the sheet itself throws, the current page is shown instead, so a recovery page
 * never takes the app down. A group (the trip stack, the sheets) offers no "Try again".
 */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import type { ErrorBoundaryProps } from 'expo-router';
import { Component, useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { sourceLocale } from '@cp/i18n';

import { clearSavedNavigation } from '@/lib/navigation/restore';
import { premiumUiThisRun } from '@/lib/premium-ui';
import { PremiumThemeProvider } from '@/ui/premium';
import { GroupErrorBoundary, RootErrorBoundary } from '@/ui/shell/RootErrorBoundary';

import { ErrorSheet } from './error-sheet';

class SafeRecovery extends Component<
  { readonly children: ReactNode; readonly fallback: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function PremiumRecovery({
  retry,
  fallback,
}: {
  readonly retry?: ErrorBoundaryProps['retry'] | undefined;
  readonly fallback: ReactNode;
}) {
  useEffect(() => clearSavedNavigation(), []);
  if (!i18n.locale) i18n.loadAndActivate({ locale: sourceLocale, messages: {} });
  return (
    <SafeRecovery fallback={fallback}>
      <GestureHandlerRootView style={styles.root}>
        <I18nProvider i18n={i18n}>
          <PremiumThemeProvider>
            <ErrorSheet {...(retry === undefined ? {} : { retry })} />
          </PremiumThemeProvider>
        </I18nProvider>
      </GestureHandlerRootView>
    </SafeRecovery>
  );
}

export function PremiumRootErrorBoundary(props: ErrorBoundaryProps) {
  const legacy = <RootErrorBoundary {...props} />;
  return premiumUiThisRun() ? <PremiumRecovery retry={props.retry} fallback={legacy} /> : legacy;
}

export function PremiumGroupErrorBoundary(props: ErrorBoundaryProps) {
  const legacy = <GroupErrorBoundary {...props} />;
  return premiumUiThisRun() ? <PremiumRecovery fallback={legacy} /> : legacy;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
