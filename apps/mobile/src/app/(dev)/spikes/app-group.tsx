import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { readOutboxActions, reloadWidgets, writeSnapshot } from '../../../../modules/cp-app-group';
import { Scaffold, Stack, Text, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const SNAPSHOT_SCHEMA = 1;

interface RoundTripResult {
  writeMs: number;
  message: string;
  writtenAt: string;
}

export default function AppGroupSpikeScreen() {
  const theme = useTheme();
  const [result, setResult] = useState<RoundTripResult | null>(null);
  const [outboxJson, setOutboxJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const writeHelloSnapshot = useCallback(() => {
    try {
      const writtenAt = new Date().toISOString();
      const message = `hello from JS @ ${writtenAt}`;
      const envelope = JSON.stringify({
        schema: SNAPSHOT_SCHEMA,
        generated_at: writtenAt,
        message,
      });

      const start = performance.now();
      writeSnapshot('hello', envelope);
      const writeMs = performance.now() - start;

      setResult({ writeMs, message, writtenAt });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const refreshWidgets = useCallback(() => {
    try {
      reloadWidgets();
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  const readOutbox = useCallback(() => {
    try {
      const actions = readOutboxActions();
      setOutboxJson(JSON.stringify(actions, null, 2));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  return (
    <Scaffold edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" variant="h3">
          cp-app-group spike
        </Text>
        <Text variant="bodySm">
          Writes a snapshot to the App Group, times the native call, reloads widgets, and reads back
          whatever an extension queued into the shared outbox.
        </Text>

        <View style={styles.buttonRow}>
          <PillButton
            variant="secondary"
            size="sm"
            label="Write hello snapshot"
            onPress={writeHelloSnapshot}
          />
        </View>
        <View style={styles.buttonRow}>
          <PillButton
            variant="secondary"
            size="sm"
            label="Reload widgets"
            onPress={refreshWidgets}
          />
        </View>
        <View style={styles.buttonRow}>
          <PillButton variant="secondary" size="sm" label="Read outbox" onPress={readOutbox} />
        </View>

        {result ? (
          <Card>
            <Stack gap="4">
              <Text variant="eyebrow">writeSnapshot round-trip</Text>
              <Text variant="rowTitle">{result.writeMs.toFixed(2)} ms</Text>
              <Text variant="bodySm">{result.message}</Text>
            </Stack>
          </Card>
        ) : null}

        {outboxJson !== null ? (
          <Card>
            <Stack gap="4">
              <Text variant="eyebrow">pending-actions.json</Text>
              <Text variant="bodySm">{outboxJson}</Text>
            </Stack>
          </Card>
        ) : null}

        {error ? <Text color={theme.semantic.state.urgent}>{error}</Text> : null}
      </ScrollView>
    </Scaffold>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    gap: 12,
    padding: 16,
  },
  buttonRow: {
    alignSelf: 'flex-start',
  },
});
