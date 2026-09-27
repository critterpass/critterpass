import { useCallback, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import { readOutboxActions, reloadWidgets, writeSnapshot } from '../../../../modules/cp-app-group';

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
  const [result, setResult] = useState<RoundTripResult | null>(null);
  const [outboxJson, setOutboxJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const writeHelloSnapshot = useCallback(() => {
    try {
      const writtenAt = new Date().toISOString();
      const message = `hello from JS @ ${writtenAt}`;
      const envelope = JSON.stringify({ schema: SNAPSHOT_SCHEMA, generated_at: writtenAt, message });

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
    <ScrollView contentContainerStyle={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        cp-app-group spike
      </Text>
      <Text style={styles.body}>
        Writes a snapshot to the App Group, times the native call, reloads widgets, and reads back
        whatever an extension queued into the shared outbox.
      </Text>

      <View style={styles.buttonRow}>
        <Button title="Write hello snapshot" onPress={writeHelloSnapshot} />
      </View>
      <View style={styles.buttonRow}>
        <Button title="Reload widgets" onPress={refreshWidgets} />
      </View>
      <View style={styles.buttonRow}>
        <Button title="Read outbox" onPress={readOutbox} />
      </View>

      {result ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>writeSnapshot round-trip</Text>
          <Text style={styles.resultValue}>{result.writeMs.toFixed(2)} ms</Text>
          <Text style={styles.body}>{result.message}</Text>
        </View>
      ) : null}

      {outboxJson !== null ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>pending-actions.json</Text>
          <Text style={styles.body}>{outboxJson}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    gap: 12,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  body: {
    fontSize: 14,
  },
  buttonRow: {
    alignSelf: 'flex-start',
  },
  resultBox: {
    gap: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  resultLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    opacity: 0.6,
  },
  resultValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  error: {
    color: '#B00020',
  },
});
