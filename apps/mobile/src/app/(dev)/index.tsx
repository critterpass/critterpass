import { router, type Href } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState, type ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { seedDemoData, type DemoScenario } from '@/data/dev/seed-demo';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { makeStyles, Scaffold, Stack, Text, useTheme } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';
import { SecondaryText } from '@/ui/cards/SecondaryText';

import { UpdatesSection } from './updates';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

interface DevScreenEntry {
  readonly testId: string;
  readonly href: Href;
  readonly label: string;
}

interface DevScreenSection {
  readonly title: string;
  readonly entries: readonly DevScreenEntry[];
}

// Every real (dev) screen, listed once here rather than deep-linked to directly: Maestro's
// `openLink` into a (dev) route is non-deterministic on EAS-hosted simulators (upstream
// mobile-dev-inc/Maestro#2610 — confirmed via a failure screenshot in an earlier pass of this
// flow), so `e2e/**` flows tap through this list instead. Grouped in the order a developer would
// scan them: the labs first (most-used), then the live checks, then every spike screen.
// `grow-into-page-detail` isn't listed: it's a sub-route `grow-into-page` navigates to itself.
const DEV_SECTIONS: readonly DevScreenSection[] = [
  {
    title: 'Labs',
    entries: [
      { testId: 'dev-nav-accounts', href: '/(dev)/accounts', label: 'Test accounts (two people)' },
      { testId: 'dev-nav-start-fresh', href: '/(dev)/start-fresh', label: 'Start as a new user' },
      {
        testId: 'dev-nav-proposal-lab',
        href: '/(dev)/proposal-lab',
        label: 'Proposal (3f scenes)',
      },
      { testId: 'dev-nav-motion-lab', href: '/(dev)/motion-lab', label: 'Motion lab' },
      { testId: 'dev-nav-sticker-lab', href: '/(dev)/sticker-lab', label: 'Sticker lab' },
      { testId: 'dev-nav-gallery', href: '/(dev)/gallery', label: 'Component gallery' },
      { testId: 'dev-nav-money-lab', href: '/(dev)/money-lab', label: 'Money (3i scenes)' },
      { testId: 'dev-nav-type-lab', href: '/(dev)/type-lab', label: 'Type lab (label centring)' },
      { testId: 'dev-nav-guide-lab', href: '/(dev)/guide-lab', label: 'Guide (3j, 4b scenes)' },
      {
        testId: 'dev-nav-bookings-lab',
        href: '/(dev)/bookings-lab',
        label: 'Bookings (3h scenes)',
      },
      {
        testId: 'dev-nav-supplier-lab',
        href: '/(dev)/supplier-lab',
        label: 'Suppliers (3h-3, 6f-1 scenes)',
      },
      {
        testId: 'dev-nav-plan-edit-lab',
        href: '/(dev)/plan-edit-lab',
        label: 'Plan editing (3e-2/3g-2 scenes)',
      },
      {
        testId: 'dev-nav-plan-views-lab',
        href: '/(dev)/plan-views-lab',
        label: 'Plan views (3e-1/3e-3 scenes)',
      },
      {
        testId: 'dev-nav-trip-day-lab',
        href: '/(dev)/trip-day-lab',
        label: 'Trip day (3k scenes)',
      },
      {
        testId: 'dev-nav-critters-lab',
        href: '/(dev)/critters-lab',
        label: 'Critters (3l scenes)',
      },
      { testId: 'dev-nav-you-lab', href: '/(dev)/you-lab', label: 'You (3n scenes)' },
      {
        testId: 'dev-nav-live-map',
        href: '/(dev)/live-map',
        label: 'Crew live map (3g-4 scenes)',
      },
      {
        testId: 'dev-nav-setup',
        href: '/(dev)/setup',
        label: 'Trip setup (3c-3…3c-10 scenes)',
      },
      {
        testId: 'dev-nav-draft',
        href: '/(dev)/draft',
        label: 'Drafting and redrafts (3c-8…3c-12, 4f-3 scenes)',
      },
      { testId: 'dev-nav-explore-lab', href: '/(dev)/explore-lab', label: 'Explore (3d scenes)' },
    ],
  },
  {
    title: 'Live checks',
    entries: [
      {
        testId: 'dev-nav-permissions',
        href: '/(dev)/permissions',
        label: 'Permissions (live status)',
      },
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
        testId: 'dev-nav-live-activities',
        href: '/(dev)/live-activities',
        label: 'Live Activities (5a-1, 5a-3, 5a-5)',
      },
    ],
  },
  {
    title: 'Spikes',
    entries: [
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
      {
        testId: 'dev-nav-spikes-critter',
        href: '/(dev)/spikes/critter',
        label: 'Spike: Critter draw',
      },
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
    ],
  },
];

/**
 * A stable, per-launch marker proving which JS bundle is actually running: `Updates.updateId` is a
 * fresh UUID every time `eas update` publishes new JS, `null` for JS embedded straight in the
 * native build. This is what `e2e/smoke/app-launch.yaml` reads to prove a Maestro run tested the
 * currently published JS rather than whatever an older reused e2e-test build happened to embed.
 */
function buildMarkerLabel(): string {
  const bundle = Updates.updateId ? `update:${Updates.updateId}` : 'update:embedded';
  // Device runs on CI export the JS with the commit inlined, and assert it here.
  const commit = process.env['EXPO_PUBLIC_JS_COMMIT'];
  return commit ? `${bundle} js:${commit}` : bundle;
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
    <Stack gap="8">
      {SEED_SCENARIOS.map((entry) => (
        <ListCard
          key={entry.scenario}
          testID={entry.testId}
          title={entry.label}
          chevron={false}
          {...(state.kind === 'seeding' ? {} : { onPress: () => void seed(entry.scenario) })}
        />
      ))}
      <SeedStatus state={state} />
    </Stack>
  );
}

/** One readable line under the seed buttons, in the state colour of the outcome. */
function SeedStatus({ state }: { readonly state: SeedState }) {
  const theme = useTheme();
  const { success, warning, urgent } = theme.semantic.state;
  switch (state.kind) {
    case 'idle':
      return null;
    case 'seeding':
      return (
        <SecondaryText variant="body" testID="dev-seed-demo-busy">
          Seeding…
        </SecondaryText>
      );
    case 'done':
      return (
        <Text
          testID={state.synced ? 'dev-seed-demo-done' : 'dev-seed-demo-unsynced'}
          color={state.synced ? success : warning}
        >
          {state.synced ? 'Demo data is on this device.' : 'Seeded; still waiting for sync.'}
        </Text>
      );
    case 'failed':
      return (
        <Text testID="dev-seed-demo-failed" color={urgent}>
          {state.message}
        </Text>
      );
  }
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <Stack gap="8">
      <Text variant="eyebrow" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </Stack>
  );
}

/**
 * Landing screen for every (dev) route, linked from the home screen's "Developer tools" entry
 * (apps/mobile/src/features/home/dev-tools-entry.tsx, hidden in production). Built from the app's
 * own components so it stays legible on the dark app background; route files don't import tokens
 * directly (docs/system-architecture.md §3).
 */
export default function DevToolsIndexScreen() {
  const styles = useStyles();
  return (
    <Scaffold edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Stack gap="4">
          <Text variant="h2" accessibilityRole="header">
            Developer tools
          </Text>
          <SecondaryText variant="caption" testID="dev-build-marker">
            {buildMarkerLabel()}
          </SecondaryText>
        </Stack>
        <Section title="Demo data">
          <SeedDemoData />
        </Section>
        {DEV_SECTIONS.map((section) => (
          <Section key={section.title} title={section.title}>
            {section.entries.map((entry) => (
              <ListCard
                key={entry.testId}
                testID={entry.testId}
                title={entry.label}
                onPress={() => router.push(entry.href)}
              />
            ))}
          </Section>
        ))}
        {/* Last: flows wait for the list entries above without scrolling. */}
        <Section title="Updates">
          <UpdatesSection />
        </Section>
      </ScrollView>
    </Scaffold>
  );
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, gap: t.space['24'] },
}));
