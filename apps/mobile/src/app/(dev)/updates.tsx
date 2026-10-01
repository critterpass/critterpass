import * as Updates from 'expo-updates';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import {
  checkForUpdateNow,
  type CheckNowOutcome,
  type CheckNowStep,
} from '@/lib/updates/check-now';
import { makeStyles, Scaffold, Stack, Text, useTheme } from '@/ui';
import { ListCard } from '@/ui/cards/ListCard';
import { SecondaryText } from '@/ui/cards/SecondaryText';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** What is known about the running JS beyond its id: where it came from and when it was published. */
function updateInfoLabel(): string {
  const published = Updates.createdAt?.toISOString().slice(0, 16).replace('T', ' ');
  const commit = process.env['EXPO_PUBLIC_JS_COMMIT'];
  return [
    `channel ${Updates.channel ?? 'none'}`,
    published === undefined ? 'embedded in the build' : `published ${published} UTC`,
    `commit ${commit ?? 'not recorded in this bundle'}`,
  ].join(' · ');
}

type CheckState = CheckNowStep | CheckNowOutcome['kind'] | 'idle';

const CHECK_LABELS: Record<CheckState, string | null> = {
  idle: null,
  checking: 'Asking the update server…',
  downloading: 'Downloading the update…',
  restarting: 'Restarting into the update…',
  up_to_date: 'This is the latest update.',
  failed: null,
};

/**
 * Where the running JS came from, and a row that checks for a published update, downloads it and
 * restarts into it without waiting for the next cold start. Builds without expo-updates (a
 * development client on Metro, device-run builds) say why the check cannot run.
 */
export function UpdatesSection() {
  const theme = useTheme();
  const [state, setState] = useState<CheckState>('idle');
  const [failure, setFailure] = useState<string | null>(null);
  const working = state === 'checking' || state === 'downloading' || state === 'restarting';
  const check = async () => {
    setFailure(null);
    const outcome = await checkForUpdateNow(
      {
        check: () => Updates.checkForUpdateAsync(),
        fetch: () => Updates.fetchUpdateAsync(),
        reload: () => Updates.reloadAsync(),
      },
      setState,
    );
    setState(outcome.kind);
    if (outcome.kind === 'failed') setFailure(outcome.message);
  };
  const label = CHECK_LABELS[state];
  return (
    <Stack gap="8">
      <SecondaryText variant="caption" testID="dev-update-info">
        {updateInfoLabel()}
      </SecondaryText>
      <ListCard
        testID="dev-update-check"
        title="Check for update now"
        chevron={false}
        {...(working ? {} : { onPress: () => void check() })}
      />
      {label === null ? null : (
        <SecondaryText variant="body" testID="dev-update-check-status">
          {label}
        </SecondaryText>
      )}
      {failure === null ? null : (
        <Text testID="dev-update-check-failed" color={theme.semantic.state.urgent}>
          {failure}
        </Text>
      )}
    </Stack>
  );
}

/** The same section on a screen of its own; the Developer tools list shows it inline. */
export default function DevUpdatesScreen() {
  const styles = useStyles();
  return (
    <Scaffold edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="h2" accessibilityRole="header">
          Updates
        </Text>
        <UpdatesSection />
      </ScrollView>
    </Scaffold>
  );
}

const useStyles = makeStyles((t) => ({
  content: { padding: t.size.gutter, gap: t.space['16'] },
}));
