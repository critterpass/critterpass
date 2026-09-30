import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import {
  DarkTheme,
  router,
  ThemeProvider as NavigationThemeProvider,
  useNavigationContainerRef,
} from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- the font preload draws each bundled family raw, before any theme or locale exists
import { Platform, StyleSheet, Text as RNText, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { appGroupOutbox, writeEndpointsConfig, writeImage } from '../../modules/cp-app-group';
import * as cpDeferredLink from '../../modules/cp-deferred-link';
import { getLocationNative } from '../../modules/cp-location';
import { cpNotifications } from '../../modules/cp-notifications/src';
import { getPermissions } from '../../modules/cp-permissions';

import { AppSessionRoot } from '@/data/app-session/AppSessionRoot';
import {
  configureDeviceAppGroup,
  deviceAppState,
  deviceSessionUid,
  deviceLinkClaims,
  devicePush,
  reportAppSessionError,
  startDeviceAppSession,
  uploadLocationFixes,
} from '@/data/app-session/device-session';
import { DeferredLinkGate, deferredLinkPrimitives } from '@/features/launch/DeferredLinkGate';
import { PassSync } from '@/features/onboarding/flow-controller/pass-sync';
import '@/features/onboarding/routes';
import '@/features/crew/chat/register';
import '@/features/crew/live-map/register';
import '@/features/crew/routes';
import '@/features/plan/day/register';
import '@/features/guide/chat/register';
import '@/features/plan/draft/register';
import '@/features/vote/register';
import { SetupNotificationActions } from '@/features/setup/notifications';
import '@/features/setup/register';
import '@/features/plan/overview/register';
import { ChangesetNotificationActions } from '@/features/plan/review/notification-actions';
import { registerOnSignOut } from '@/data/auth/sign-out-hooks';
import { useCommand } from '@/data/commands/use-command';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { usePushNotifications } from '@/data/push/use-push-notifications';
import { watchRows } from '@/data/status/watch-rows';
import {
  AnalyticsProvider,
  createAnalyticsClient,
  posthogKeyFromEnv,
  useAnalytics,
  useScreenTracking,
} from '@/lib/analytics';
import { BUNDLED_FONT_FAMILIES, useFontsReady } from '@/lib/fonts';
import { I18nRoot, useI18nReady } from '@/lib/i18n/I18nRoot';
import {
  bindTempleMute,
  configureAlwaysUpgrade,
  countryOf,
  RECORD_VISIT,
  readLocationFlags,
  SET_CONSENT,
  trackLocationSession,
  trackVisitRecorded,
  useAppActive,
  useExploreAtHome,
  useLocationEngineBridge,
  useVisitBridge,
  useVisitConsentRows,
  visitConsentGranted,
  visitConsentPayload,
  type RowWatcher,
} from '@/lib/location';
import { useNavigationPersistence } from '@/lib/navigation/restore';
import {
  configurePermissions,
  sendMirrorThroughSession,
  trackPermissionEvent,
  UPDATE_DEVICE_PERMISSIONS,
  usePermission,
  usePermissionsBridge,
  type DevicePermissionState,
} from '@/lib/permissions';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { analyticsViolationBreadcrumb, initAppSentry, sentryDsnFromEnv } from '@/lib/observability';
import { ThemeProvider } from '@/lib/theme';
import { feedback } from '@/motion/feedback';
import { useMotionMode } from '@/motion/motion-mode';
import { IslandToast } from '@/motion/island-toast';
import { OverlayHost } from '@/motion/overlay/OverlayHost';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { SharedGrowHost } from '@/ui/transitions/SharedGrow';
import { Text, useTheme } from '@/ui';
import { PrimerSheetHost, VisitConsentHost } from '@/ui/permission-primer';
import { useNoBackAffordanceGuard } from '@/ui/qa/back-affordance';
import { RootErrorBoundary } from '@/ui/shell/RootErrorBoundary';

void SplashScreen.preventAutoHideAsync();

// Expo Router renders this in place of the root layout when anything below it throws.
export { RootErrorBoundary as ErrorBoundary };

// The session drains and configures the App Group the extensions share.
configureDeviceAppGroup({ outbox: appGroupOutbox, writeEndpointsConfig });

const deferredLinks = deferredLinkPrimitives(
  cpDeferredLink,
  Platform.OS,
  Constants.expoConfig?.extra?.appVariant,
);
const openHref = (href: string) => router.replace(href);

initAppSentry({
  dsn: sentryDsnFromEnv(),
  environment: String(Constants.expoConfig?.extra?.['appVariant'] ?? 'development'),
});

/** Product analytics: sends nothing until the analytics consent is granted. */
const analytics = createAnalyticsClient({
  apiKey: posthogKeyFromEnv(),
  dev: __DEV__,
  onViolation: analyticsViolationBreadcrumb,
});
registerOnSignOut(() => analytics.reset());

// Every OS permission goes through one primer-first orchestrator over the native module; results
// are mirrored to the server (update_device_permissions) through the live session.
configurePermissions({
  port: getPermissions(),
  sendMirror: sendMirrorThroughSession,
  track: (event) => trackPermissionEvent(analytics, event),
});

configureAlwaysUpgrade({ allowed: () => readLocationFlags(analytics).alwaysUpsell });

/** Session-scoped bridges; they need the local-first session, so they wait for it. */
function SessionBridges() {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return null;
  return (
    <>
      <PermissionsBridge />
      <LocationBridge db={localFirst.db} />
      <SetupNotificationActions />
      <ChangesetNotificationActions />
    </>
  );
}

/** The trip-day location engine over the native session, fed from synced rows. */
function LocationBridge({ db }: { readonly db: Parameters<typeof watchRows>[0] }) {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => void deviceSessionUid().then(setUid, () => setUid(null)), []);
  const watch = useCallback<RowWatcher>(
    (sql, tables, onRows) => watchRows(db, sql, tables, onRows),
    [db],
  );
  const location = usePermission('location').report;
  const { engine, plan } = useLocationEngineBridge({
    session: getLocationNative(),
    upload: uploadLocationFixes,
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    watch,
    uid,
    level: location?.status === 'granted' ? (location.level ?? 'none') : 'none',
    appActive: useAppActive(),
    deviceTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    exploreAtHome: useExploreAtHome(),
    androidBackgroundGeofences: readLocationFlags(analytics).androidBackgroundGeofences,
    countryOf,
    onSessionEnded: (summary) => trackLocationSession(analytics, summary),
  });
  const consentRows = useVisitConsentRows(watch);
  const { send: sendVisit } = useCommand(RECORD_VISIT);
  const { send: sendConsent } = useCommand(SET_CONSENT);
  useVisitBridge({
    engine,
    plan,
    consentGranted: visitConsentGranted(consentRows),
    send: sendVisit,
    track: (source) => trackVisitRecorded(analytics, source),
  });
  return (
    <VisitConsentHost
      decided={consentRows.length > 0}
      onAnswer={(granted) => void sendConsent(visitConsentPayload(granted))}
    />
  );
}

bindTempleMute(feedback.setContextMute);

function PermissionsBridge() {
  const { send } = useCommand(UPDATE_DEVICE_PERMISSIONS);
  const sendMirror = useCallback((perms: DevicePermissionState) => send({ perms }), [send]);
  usePermissionsBridge(getPermissions(), sendMirror);
  return null;
}

/** Saved navigation is only restored into the same JS build it was saved from. */
const BUILD = `${Constants.expoConfig?.version ?? ''}:${Updates.updateId ?? 'embedded'}`;

/**
 * Screens scale to .93 under a sheet, so whatever sits behind a card shows at the edges: every card
 * and the navigator itself stay on the app's ink, never the navigation library's light grey.
 */
function inkNavigationTheme(ink: string) {
  return { ...DarkTheme, colors: { ...DarkTheme.colors, background: ink, card: ink } };
}

/** Drill-down pushes by default; the `(modal)` group presents sheets and rises over the stack. */
function RootNavigator() {
  const { motion, color } = useTheme();
  const navigationTheme = useMemo(() => inkNavigationTheme(color.ink['950']), [color.ink]);
  const [motionMode] = useMotionMode();
  const navigationRef = useNavigationContainerRef();
  const [launchUrl, setLaunchUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    Linking.getInitialURL()
      .then(setLaunchUrl)
      .catch(() => setLaunchUrl(null));
  }, []);
  useNavigationPersistence({ navigationRef, build: BUILD, launchUrl });
  useNoBackAffordanceGuard();
  useScreenTracking(useAnalytics());
  usePushNotifications(cpNotifications);
  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
        {/* eslint-disable-next-line lingui/no-unlocalized-strings -- a route group name, not copy */}
        <Stack.Screen name="(modal)" options={modalGroupOptions()} />
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const theme = useTheme();
  const fontsReady = useFontsReady();
  const i18nReady = useI18nReady();
  const [prewarmed, setPrewarmed] = useState(false);
  // The first-launch deferred link check holds the splash (bounded; see DeferredLinkGate).
  const [linksReady, setLinksReady] = useState(false);

  // Render one hidden glyph per bundled face for a frame before revealing the app: this forces
  // the OS to rasterise each font's glyph atlas once up front, so the first *visible* text using
  // it doesn't stutter (design-system.md: fonts are prewarmed before the first hero paint).
  useEffect(() => {
    if (!fontsReady || !i18nReady) return undefined;
    const frame = requestAnimationFrame(() => setPrewarmed(true));
    return () => cancelAnimationFrame(frame);
  }, [fontsReady, i18nReady]);

  useEffect(() => {
    if (fontsReady && i18nReady && prewarmed && linksReady) {
      void SplashScreen.hideAsync();
    }
  }, [fontsReady, i18nReady, prewarmed, linksReady]);

  // Gated on both: I18nRoot's own I18nProvider would otherwise render nothing until a locale is
  // active, which would swap the splash screen for a blank frame instead of keeping it up.
  if (!fontsReady || !i18nReady) return null;

  // Provider order: gestures (one root for every GestureDetector) → locale → theme (contrast, font
  // scale) → session (local-first database, realtime) → screen jolt → navigation, with the overlay, shared-grow and toast hosts above screens.
  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: theme.color.ink['950'] }]}>
      <I18nRoot>
        {prewarmed ? null : (
          <View pointerEvents="none" style={styles.prewarm}>
            {BUNDLED_FONT_FAMILIES.map((family) => (
              <RNText key={family} style={{ fontFamily: family }}>
                Aa
              </RNText>
            ))}
          </View>
        )}
        <ThemeProvider>
          <AnalyticsProvider client={analytics}>
            <AppSessionRoot
              start={startDeviceAppSession}
              appState={deviceAppState}
              onError={reportAppSessionError}
              push={devicePush}
            >
              <ScreenJoltProvider>
                <RootNavigator />
                <DeferredLinkGate
                  primitives={deferredLinks}
                  navigate={openHref}
                  claims={deviceLinkClaims}
                  onReady={() => setLinksReady(true)}
                />
                <SessionBridges />
                <PassSync writeAppGroupImage={writeImage} />
                <OverlayHost />
                <PrimerSheetHost />
                <SharedGrowHost />
                <IslandToast Text={Text} />
              </ScreenJoltProvider>
            </AppSessionRoot>
          </AnalyticsProvider>
        </ThemeProvider>
      </I18nRoot>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  prewarm: {
    position: 'absolute',
    opacity: 0,
  },
});
