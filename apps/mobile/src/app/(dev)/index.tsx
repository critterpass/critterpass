import { Link } from 'expo-router';
import * as Updates from 'expo-updates';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

interface DevScreenEntry {
  readonly testId: string;
  readonly href: string;
  readonly label: string;
}

// Every real (dev) screen, listed once here rather than deep-linked to directly: Maestro's
// `openLink` into a (dev) route is non-deterministic on EAS-hosted simulators (upstream
// mobile-dev-inc/Maestro#2610 — confirmed via a failure screenshot in an earlier pass of this
// flow), so `e2e/**` flows tap through this list instead. Grouped in the order a developer would
// scan them: the motion lab first (most-used), then every spike screen. `grow-into-page-detail`
// isn't listed: it's a sub-route `grow-into-page` navigates to itself, not a top-level entry.
const DEV_SCREENS: readonly DevScreenEntry[] = [
  { testId: 'dev-nav-motion-lab', href: '/(dev)/motion-lab', label: 'Motion lab' },
  { testId: 'dev-nav-sticker-lab', href: '/(dev)/sticker-lab', label: 'Sticker lab' },
  { testId: 'dev-nav-gallery', href: '/(dev)/gallery', label: 'Component gallery' },
  { testId: 'dev-nav-permissions', href: '/(dev)/permissions', label: 'Permissions (live status)' },
  {
    testId: 'dev-nav-permissions-primer',
    href: '/(dev)/permissions-primer',
    label: 'Permissions primer (3a-9)',
  },
  {
    testId: 'dev-nav-spikes-app-group',
    href: '/(dev)/spikes/app-group',
    label: 'Spike: App group',
  },
  {
    testId: 'dev-nav-spikes-auth',
    href: '/(dev)/spikes/auth',
    label: 'Spike: Auth (anonymous upgrade)',
  },
  { testId: 'dev-nav-spikes-critter', href: '/(dev)/spikes/critter', label: 'Spike: Critter draw' },
  {
    testId: 'dev-nav-spikes-critterdex-grid',
    href: '/(dev)/spikes/critterdex-grid',
    label: 'Spike: Critterdex grid',
  },
  {
    testId: 'dev-nav-spikes-grow-into-page',
    href: '/(dev)/spikes/grow-into-page',
    label: 'Spike: Grow-into-page transitions',
  },
  {
    testId: 'dev-nav-spikes-live-activity',
    href: '/(dev)/spikes/live-activity',
    label: 'Spike: Live Activity',
  },
  {
    testId: 'dev-nav-spikes-location',
    href: '/(dev)/spikes/location',
    label: 'Spike: Location dwell',
  },
  {
    testId: 'dev-nav-spikes-map',
    href: '/(dev)/spikes/map',
    label: 'Spike: Map offline (PMTiles)',
  },
  {
    testId: 'dev-nav-spikes-timeline-drag',
    href: '/(dev)/spikes/timeline-drag',
    label: 'Spike: Timeline drag',
  },
];

/**
 * A stable, per-launch marker proving which JS bundle is actually running: `Updates.updateId` is a
 * fresh UUID every time `eas update` publishes new JS, `null` for JS embedded straight in the
 * native build. This is what `e2e/smoke/app-launch.yaml` reads to prove a Maestro run tested the
 * currently published JS rather than whatever an older reused e2e-test build happened to embed.
 */
function buildMarkerLabel(): string {
  if (Updates.updateId) return `update:${Updates.updateId}`;
  return 'update:embedded';
}

/**
 * Landing screen for every (dev) route, linked from the home screen's "Developer tools" entry
 * (apps/mobile/src/app/index.tsx, hidden outside development/staging). Dev-only (excluded from
 * production per the marker above); plain StyleSheet, no @cp/design-tokens import — route files
 * don't import tokens directly (docs/system-architecture.md §3).
 */
export default function DevToolsIndexScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.heading}>
        Developer tools
      </Text>
      <Text testID="dev-build-marker" style={styles.marker}>
        {buildMarkerLabel()}
      </Text>
      <View style={styles.list}>
        {DEV_SCREENS.map((entry) => (
          <Link key={entry.href} href={entry.href} asChild>
            <Pressable testID={entry.testId} style={styles.row}>
              <Text>{entry.label}</Text>
            </Pressable>
          </Link>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 8,
  },
  heading: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  marker: {
    opacity: 0.6,
    marginBottom: 8,
  },
  list: {
    gap: 8,
  },
  row: {
    borderWidth: 1,
    borderColor: 'gray',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
});
