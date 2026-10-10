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
import { useContext, useEffect, useMemo, useState } from 'react';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports -- the font preload draws each bundled family raw, before any theme or locale exists
import { Platform, StyleSheet, Text as RNText, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { getAlarmPort } from '../../modules/cp-alarm';
import {
  appGroupOutbox,
  writeEndpointsConfig,
  writeImage,
  writeSnapshot,
} from '../../modules/cp-app-group';
import * as cpDeferredLink from '../../modules/cp-deferred-link';
import { getLocationNative } from '../../modules/cp-location';
import { cpNotifications } from '../../modules/cp-notifications/src';
import { getPermissions } from '../../modules/cp-permissions';

import { AppSessionRoot } from '@/data/app-session/AppSessionRoot';
import {
  configureDeviceAppGroup,
  deviceAppState,
  deviceLinkClaims,
  devicePush,
  reportAppSessionError,
  sessionHeaders,
  startDeviceAppSession,
} from '@/data/app-session/device-session';
import { createTravelDataReader, TravelDataReaderProvider } from '@/data/travel-data/client';
import { DeferredLinkGate, deferredLinkPrimitives } from '@/features/launch/DeferredLinkGate';
import { PassSync } from '@/features/onboarding/flow-controller/pass-sync';
import '@/features/onboarding/routes';
import '@/features/crew/chat/register';
import '@/features/crew/live-map/register';
import '@/features/crew/routes';
import '@/features/plan/day/register';
import '@/features/guide/chat/register';
import '@/features/plan/draft/register';
import '@/features/proposal/register';
import '@/features/vote/register';
import '@/features/money/chat/register';
import '@/features/plan/review/register-chat-card';
import { SetupNotificationActions } from '@/features/setup/notifications';
import '@/features/setup/register';
import { TripDayRuntime } from '@/features/trip/hub/register';
import { CritterRuntime } from '@/features/critters/register';
import { SafetyRuntime } from '@/features/safety/register';
import '@/features/bookings/supplier/register';
import '@/features/you/routes';
import { MemberFacesRoot } from '@/features/you/avatar/member-faces';
import '@/features/help/routes';
import '@/features/recap/routes';
import '@/features/monetize/routes';
import '@/features/monetize/register';
import '@/features/drivers/share/register';
import '@/features/drivers/ours/routes';
import '@/features/community/register';
import '@/features/album/routes';
// After every feature register above: planning registrations win for the ids they re-point.
import '@/features/planning-register';
import { ChangesetNotificationActions } from '@/features/plan/review/notification-actions';
import { NotificationActions } from '@/features/you/ping-settings/notification-actions';
import { VendorNotificationActions } from '@/features/bookings/supplier/notification-actions';
import { registerOnSignOut } from '@/data/auth/sign-out-hooks';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { usePushNotifications } from '@/data/push/use-push-notifications';
import {
  AnalyticsProvider,
  createAnalyticsClient,
  posthogKeyFromEnv,
  useAnalytics,
  useScreenTracking,
} from '@/lib/analytics';
import { DevToolsShake } from '@/lib/dev-tools/DevToolsShake';
import { BUNDLED_FONT_FAMILIES, useFontsReady } from '@/lib/fonts';
import { I18nRoot, useI18nReady } from '@/lib/i18n/I18nRoot';
import { bindTempleMute, configureAlwaysUpgrade, readLocationFlags } from '@/lib/location';
import {
  forgetNavigationForAccountSwitch,
  useNavigationPersistence,
} from '@/lib/navigation/restore';
import {
  configurePermissions,
  sendMirrorThroughSession,
  trackPermissionEvent,
} from '@/lib/permissions';
import { SHEET_GROUPS, sheetGroupOptions } from '@/lib/navigation/sheet-routes';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { analyticsViolationBreadcrumb, initAppSentry, sentryDsnFromEnv } from '@/lib/observability';
import { usePremiumUi } from '@/lib/premium-ui';
import { ThemeProvider } from '@/lib/theme';
import { feedback } from '@/motion/feedback';
import { useMotionMode } from '@/motion/motion-mode';
import { IslandToast } from '@/motion/island-toast';
import { TouchQuietRoot } from '@/lib/interaction/touch-quiet';
import { LaunchHatch } from '@/features/onboarding/hatch/LaunchHatch';
import { OverlayHost } from '@/motion/overlay/OverlayHost';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { SharedGrowHost } from '@/ui/transitions/SharedGrow';
import { PremiumThemeProvider } from '@/ui/premium';
import { PremiumKeyboardProvider } from '@/ui/premium/shell';
import { PremiumRootStack } from '@/ui/premium/shell/navigation/premium-root-stack';
import { Text, useTheme } from '@/ui';
import { PrimerSheetHost } from '@/ui/permission-primer';
import { useNoBackAffordanceGuard } from '@/ui/qa/back-affordance';
import { reportTruncatedToastTitle } from '@/ui/qa/toast-title-check';
import { RootErrorBoundary } from '@/ui/shell/RootErrorBoundary';
import { SessionDatabaseProvider } from '@/ui/states/SessionGate';
import { FeedbackRuntime } from '@/features/help/feedback/device-outbox';
import { ShakeToReport } from '@/features/help/shake/ShakeListener';
import { LocationBridge, PermissionsBridge } from '@/features/session-bridges';

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
// A sign-out or account switch: the app opens on Home next, never on the last account's screens.
registerOnSignOut(forgetNavigationForAccountSwitch);

// Every OS permission goes through one primer-first orchestrator over the native module; results
// are mirrored to the server (update_device_permissions) through the live session.
configurePermissions({
  port: getPermissions(),
  sendMirror: sendMirrorThroughSession,
  track: (event) => trackPermissionEvent(analytics, event),
});

configureAlwaysUpgrade({ allowed: () => readLocationFlags(analytics).alwaysUpsell });

/** Weather, fares, hazards, crowds and destination insights read the api with this session. */
const travelData = createTravelDataReader({ sessionHeaders });

/** Session-scoped bridges; they need the local-first session, so they wait for it. */
function SessionBridges() {
  const localFirst = useContext(LocalFirstContext);
  if (localFirst === null) return null;
  return (
    <>
      <PermissionsBridge permissions={getPermissions()} />
      <LocationBridge db={localFirst.db} session={getLocationNative()} analytics={analytics} />
      <SetupNotificationActions />
      <ChangesetNotificationActions />
      <NotificationActions />
      <VendorNotificationActions />
      <TripDayRuntime alarmPort={getAlarmPort()} />
      <CritterRuntime writeSnapshot={writeSnapshot} />
      <SafetyRuntime />
      <FeedbackRuntime />
    </>
  );
}

bindTempleMute(feedback.setContextMute);

/** Saved navigation is only restored into the same JS build it was saved from. */
const BUILD = `${Constants.expoConfig?.version ?? ''}:${Updates.updateId ?? 'embedded'}`;

/**
 * Screens scale to .93 under a sheet, so whatever sits behind a card shows at the edges: every card
 * and the navigator itself stay on the app's ink, never the navigation library's light grey.
 */
function inkNavigationTheme(ink: string) {
  return { ...DarkTheme, colors: { ...DarkTheme.colors, background: ink, card: ink } };
}

/**
 * Drill-down pushes by default; the `(modal)` group presents sheets and rises over the stack, and so
 * does a group while one of its own sheet routes is in front (the crews sheet, a new poll, place
 * search).
 */
function RootNavigator() {
  const { motion, color } = useTheme();
  const navigationTheme = useMemo(() => inkNavigationTheme(color.ink['950']), [color.ink]);
  const [motionMode] = useMotionMode();
  const navigationRef = useNavigationContainerRef();
  // The session-only groups hold their screens until the local database is open.
  const databaseOpen = useContext(LocalFirstContext) !== null;
  const [launchUrl, setLaunchUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    Linking.getInitialURL()
      .then(setLaunchUrl)
      .catch(() => setLaunchUrl(null));
  }, []);
  // Premium and the current UI keep separate saved navigation: their navigators differ.
  const premium = usePremiumUi();
  useNavigationPersistence({
    navigationRef,
    build: `${BUILD}:${premium ? 'premium' : 'current'}`,
    launchUrl,
  });
  useNoBackAffordanceGuard();
  useScreenTracking(useAnalytics());
  usePushNotifications(cpNotifications);
  if (premium) {
    // The one root premium theme: it sets the OS appearance and the status bar, so it lives only
    // on the premium path; the current UI stays dark whatever the premium appearance setting says.
    return (
      <PremiumThemeProvider>
        <PremiumKeyboardProvider>
          <SessionDatabaseProvider value={databaseOpen}>
            <PremiumRootStack />
          </SessionDatabaseProvider>
        </PremiumKeyboardProvider>
      </PremiumThemeProvider>
    );
  }
  return (
    <NavigationThemeProvider value={navigationTheme}>
      <SessionDatabaseProvider value={databaseOpen}>
        <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
          {/* eslint-disable-next-line lingui/no-unlocalized-strings -- a route group name, not copy */}
          <Stack.Screen name="(modal)" options={modalGroupOptions()} />
          {SHEET_GROUPS.map((name) => (
            <Stack.Screen key={name} name={name} options={sheetGroupOptions} />
          ))}
        </Stack>
      </SessionDatabaseProvider>
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
              <TravelDataReaderProvider value={travelData}>
                <MemberFacesRoot>
                  <ScreenJoltProvider>
                    <TouchQuietRoot>
                      <RootNavigator />
                    </TouchQuietRoot>
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
                    <IslandToast Text={Text} onTitleLayout={reportTruncatedToastTitle} />
                    <DevToolsShake />
                    <ShakeToReport />
                    <LaunchHatch revealed={prewarmed && linksReady} />
                  </ScreenJoltProvider>
                </MemberFacesRoot>
              </TravelDataReaderProvider>
            </AppSessionRoot>
          </AnalyticsProvider>
        </ThemeProvider>
      </I18nRoot>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  prewarm: { position: 'absolute', opacity: 0 },
});
