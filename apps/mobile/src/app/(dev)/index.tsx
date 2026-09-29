import { Link } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { seedDemoData, type DemoScenario } from '@/data/dev/seed-demo';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

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
    testId: 'dev-nav-location-engine',
    href: '/(dev)/location-engine',
    label: 'Location engine (trip day)',
  },
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

const SEED_SCENARIOS: readonly {
  readonly scenario: DemoScenario;
  readonly testId: string;
  readonly label: string;
}[] = [
  { scenario: 'everyday', testId: 'dev-seed-demo', label: 'Seed demo data' },
  { scenario: 'inbox', testId: 'dev-seed-demo-inbox', label: 'Seed demo data: one card needs you' },
  {
    scenario: 'caught_up',
    testId: 'dev-seed-demo-caught-up',
    label: 'Seed demo data: all caught up',
  },
  { scenario: 'vote', testId: 'dev-seed-demo-vote', label: 'Seed demo data: destination vote' },
  {
    scenario: 'vote_final',
    testId: 'dev-seed-demo-vote-final',
    label: 'Seed demo data: destination vote in its final',
  },
];

type SeedState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'seeding' }
  | { readonly kind: 'done'; readonly synced: boolean }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Staging only: gives this account the api's demo world (a crew, a trip three weeks out, chat, a
 * tip and an inbox) and waits until sync has delivered it. `dev-seed-demo-done` appears once the
 * rows are on the device; Maestro flows wait for it (e2e/_shared/seed-demo.yaml).
 */
function SeedDemoData() {
  const [state, setState] = useState<SeedState>({ kind: 'idle' });
  const seed = async (scenario: DemoScenario) => {
    setState({ kind: 'seeding' });
    try {
      // Loaded on press: the device session pulls in every native module the app runs on.
      const { sessionHeaders, startDeviceAppSession } =
        await import('@/data/app-session/device-session');
      const session = await startDeviceAppSession();
      const outcome = await seedDemoData(
        { baseUrl: resolveApiBaseUrl(), sessionHeaders, db: session.localFirst.db },
        scenario,
      );
      setState({ kind: 'done', synced: outcome.synced });
    } catch (error) {
      setState({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  };
  return (
    <View style={styles.list}>
      {SEED_SCENARIOS.map((entry) => (
        <Pressable
          key={entry.scenario}
          testID={entry.testId}
          style={styles.row}
          disabled={state.kind === 'seeding'}
          onPress={() => void seed(entry.scenario)}
        >
          <Text>{entry.label}</Text>
        </Pressable>
      ))}
      {state.kind === 'seeding' ? <Text testID="dev-seed-demo-busy">Seeding…</Text> : null}
      {state.kind === 'done' ? (
        <Text testID={state.synced ? 'dev-seed-demo-done' : 'dev-seed-demo-unsynced'}>
          {state.synced ? 'Demo data is on this device.' : 'Seeded; still waiting for sync.'}
        </Text>
      ) : null}
      {state.kind === 'failed' ? <Text testID="dev-seed-demo-failed">{state.message}</Text> : null}
    </View>
  );
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
      <SeedDemoData />
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
