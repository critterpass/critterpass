/**
 * The app's error boundaries with the premium "Something broke" sheet (3.20). The layouts export
 * these. Each mounts its own gesture root, locale and theme (the layout that failed may have been
 * the one providing them) and drops the saved navigation: that state still points at the screen
 * that threw. If the sheet itself throws, a plain page is shown instead, so a recovery page never
 * takes the app down. Every boundary, the root's and a group's (the trip stack, the sheets), offers "Try again": it
 * re-renders the routes under that boundary.
 */
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import type { ErrorBoundaryProps } from 'expo-router';
import { Component, useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { sourceLocale } from '@cp/i18n';

import { clearSavedNavigation } from '@/lib/navigation/restore';
import { PremiumThemeProvider } from '@/ui/premium';
import { PlainRecovery } from './plain-recovery';

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
  return <PremiumRecovery retry={props.retry} fallback={<PlainRecovery retry={props.retry} />} />;
}

export function PremiumGroupErrorBoundary(props: ErrorBoundaryProps) {
  return <PremiumRecovery retry={props.retry} fallback={<PlainRecovery retry={props.retry} />} />;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
