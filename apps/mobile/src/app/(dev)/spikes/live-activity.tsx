import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { writeSnapshot, reloadWidgets } from '../../../../modules/cp-app-group';
import { Scaffold, Text } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/**
 * This screen cannot start a real ActivityKit Live Activity — that needs a `cp-live-activity`/
 * `cp-alarm` native module a later phase builds. What it proves here: the app can seed the
 * `LeaveByActivityAttributes` content-state shape the widget extension's `ActivityConfiguration`
 * (apps/mobile/targets/widgets/CritterpassWidgetsBundle.swift) reads, and that the device-action-
 * key round trip to the `apns-live-activity` harness works from a real HTTP call. Real broadcast
 * push / push-to-start needs the founder's APNs .p8 — see the ADR.
 */
export default function LiveActivitySpikeScreen() {
  const [status, setStatus] = useState<string | null>(null);

  const seedLeaveByPreview = useCallback(() => {
    try {
      const generatedAt = new Date().toISOString();
      const contentState = {
        leave_at: new Date(Date.now() + 10 * 60_000).toISOString(),
        state: 'soon',
        up_count: 1,
        total: 3,
        pips: [{ uid_hash: 'spike-uid-1', up: true }],
        leg: 'Hotel → Airport',
        guide_line: "Tokek: pack the chargers, we're close.",
      };
      writeSnapshot(
        'la-leave-by-preview',
        JSON.stringify({ schema: 1, generated_at: generatedAt, content_state: contentState }),
      );
      reloadWidgets();
      setStatus(`Seeded la-leave-by-preview at ${generatedAt}`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  return (
    <Scaffold edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" variant="h3">
          Live Activity spike
        </Text>
        <Text variant="bodySm">
          Real APNs broadcast/push-to-start needs the founder&apos;s .p8 key (not available in this
          environment). This screen only proves the App Group half: writing a LeaveBy content-state
          the widget target can read.
        </Text>

        <View style={styles.buttonRow}>
          <PillButton
            variant="secondary"
            size="sm"
            label="Seed leave-by preview snapshot"
            onPress={seedLeaveByPreview}
          />
        </View>

        {status ? <Text variant="bodySm">{status}</Text> : null}

        <Text variant="title">Founder checklist (device, real .p8 required)</Text>
        <Text variant="bodySm">
          1. Set APNS_KEY_PATH / APNS_KEY_ID / APNS_TEAM_ID and run{'\n'}
          {'   '}pnpm --filter @cp/spikes run apns-live-activity{'\n'}
          2. Confirm broadcast channel create/push-to-start/update/end/delete all print PASS.{'\n'}
          3. Install the EAS build on a real iPhone, trigger a push-to-start, and confirm the
          Dynamic Island/lock screen renders and &quot;I&apos;M UP&quot; reaches this screen&apos;s
          action-key harness.
        </Text>
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
