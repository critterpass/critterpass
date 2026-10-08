import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';

import { generateUuidV7, newPassDraft } from '@cp/domain';

import { seedDemoData } from '@/data/dev/seed-demo';
import {
  runStartAs,
  START_AS_SYNC_TIMEOUT_MS,
  type StartAsPorts,
  type StartAsResult,
  type StartAsStep,
} from '@/data/dev/start-as';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { markOnboardingComplete } from '@/features/onboarding/flow-controller/completion';
import {
  readDraft,
  updateDraft,
  writeDraft,
} from '@/features/onboarding/flow-controller/draft-store';
import { setLocale } from '@/lib/i18n/set-locale';
import { isOnboardingComplete } from '@/lib/links/pending';
import { makeStyles, Scaffold, Stack, Text, useTheme } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';
import { SecondaryText } from '@/ui/cards/SecondaryText';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const TESTER_NAME = 'Tester';
/** The HOME tab by its group: from inside this group `/` is the Developer tools list. */
const HOME_TAB = '/(tabs)';
/** How long the pass waits for its reserved number before it is issued without one. */
const NUMBER_WAIT_MS = 10_000;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const STEP_LINES: Readonly<Record<StartAsStep, string>> = {
  request: 'Reading the request…',
  account: 'Signing in a new account…',
  pass: 'Issuing the pass…',
  seed: 'Seeding the scenario and waiting for its rows…',
  sync: 'Checking the rows on this phone…',
};

/** Loaded on use: the device session pulls in every native module the app runs on. */
async function deviceSession() {
  const { sessionHeaders, startDeviceAppSession } =
    await import('@/data/app-session/device-session');
  return { sessionHeaders, session: await startDeviceAppSession() };
}

const ports: StartAsPorts = {
  hasAccount: isOnboardingComplete,
  startSession: async () => {
    await deviceSession();
  },
  setLanguage: (lang) => setLocale(lang),
  // The pass in onboarding's own order, sent by the app's pass sync: filled in first, which
  // reserves its number, then issued, as it stands after "Not now". A number that has not come
  // back in time does not hold the issue up (offline onboarding issues without one too).
  issuePass: async (homeIata) => {
    const draft = readDraft() ?? newPassDraft(generateUuidV7());
    writeDraft({
      ...draft,
      step: 'home',
      given_name: TESTER_NAME,
      avatar: { kind: 'initials' },
      taste_done: true,
      home_iata: homeIata,
    });
    const deadline = Date.now() + NUMBER_WAIT_MS;
    while (readDraft()?.number == null && Date.now() < deadline) await pause(250);
    updateDraft((filled) => ({
      ...filled,
      step: 'saved',
      issued_at: filled.issued_at ?? new Date().toISOString(),
    }));
    return draft.pass_id;
  },
  passIssued: async (passId) => {
    const { session } = await deviceSession();
    const row = await session.localFirst.db.getOptional<{ id: string }>(
      "SELECT id FROM passes WHERE id = ? AND status = 'issued'",
      [passId],
    );
    return row !== null;
  },
  seed: async (scenario, syncTimeoutMs) => {
    const { sessionHeaders, session } = await deviceSession();
    return seedDemoData(
      { baseUrl: resolveApiBaseUrl(), sessionHeaders, db: session.localFirst.db, syncTimeoutMs },
      scenario,
    );
  },
  markOnboarded: markOnboardingComplete,
  wait: pause,
  now: () => Date.now(),
  syncTimeoutMs: START_AS_SYNC_TIMEOUT_MS,
};

type State =
  | { readonly kind: 'running'; readonly step: StartAsStep }
  | { readonly kind: 'done'; readonly result: StartAsResult };

/**
 * "Start as" (Developer tools): the screen a device flow's launch argument opens on a cleared
 * install (lib/dev-tools/start-as-launch.tsx), with `scenario` and `lang` as its params. It runs
 * the steps of data/dev/start-as.ts once and ends in exactly one of two states a flow waits for:
 * `start-as-ready`, a card that opens Home (with the crew's join code beside it when the scenario
 * answers one), or `start-as-failed`, one line saying which step failed and why.
 */
export default function DevStartAsScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const params = useLocalSearchParams<{ scenario?: string; lang?: string }>();
  const [state, setState] = useState<State>({ kind: 'running', step: 'request' });
  const { scenario, lang } = params;

  useEffect(() => {
    let live = true;
    void runStartAs(ports, { scenario, lang }, (step) => {
      if (live) setState({ kind: 'running', step });
    }).then((result) => {
      if (live) setState({ kind: 'done', result });
    });
    return () => {
      live = false;
    };
    // Once per screen: the params are the launch's and never change under it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Scaffold edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} testID="start-as-screen">
        <Stack gap="4">
          <Text variant="h2" accessibilityRole="header">
            Start as
          </Text>
          <SecondaryText variant="caption" testID="start-as-request">
            {`${scenario ?? '(no scenario)'} · ${lang ?? 'en'}`}
          </SecondaryText>
        </Stack>
        {state.kind === 'running' ? (
          <Text singleLine={false} testID="start-as-running">
            {STEP_LINES[state.step]}
          </Text>
        ) : state.result.kind === 'ready' ? (
          <Stack gap="8">
            <ListCard
              testID="start-as-ready"
              title="Ready: open Home"
              onPress={() => router.replace(HOME_TAB)}
            />
            {state.result.code === null ? null : (
              <Text testID="start-as-code" color={theme.semantic.state.success}>
                {state.result.code}
              </Text>
            )}
          </Stack>
        ) : (
          <Text singleLine={false} testID="start-as-failed" color={theme.semantic.state.urgent}>
            {state.result.line}
          </Text>
        )}
      </ScrollView>
    </Scaffold>
  );
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, gap: t.space['24'] },
}));
