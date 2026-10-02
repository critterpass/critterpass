import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState, type ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { seedDemoData, type DemoScenario } from '@/data/dev/seed-demo';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { DEV_SECTIONS } from '@/lib/dev-tools/dev-screens';
import { makeStyles, Scaffold, Stack, Text, useTheme } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';
import { SecondaryText } from '@/ui/cards/SecondaryText';

import { UpdatesSection } from './updates';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

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
