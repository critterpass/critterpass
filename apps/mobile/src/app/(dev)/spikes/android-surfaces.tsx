import { useCallback, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  cancelFullScreenAlarm,
  canScheduleExactAlarms,
  canUseFullScreenIntent,
  dismissLiveUpdate,
  openExactAlarmSettings,
  openFullScreenIntentSettings,
  scheduleFullScreenAlarm,
  simulateLiveUpdatePush,
} from '../../../../modules/cp-spike-android';
import type { LiveUpdatePushPayload } from '../../../../modules/cp-spike-android';
import { Scaffold, Text } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const ALARM_DELAY_SECONDS = 10;

/** Drives the T14 Android surfaces spike: FSI/exact-alarm permission flow, alarm scheduling, and
 * the Live Update push receiver's local test hook (no Firebase project exists — see the ADR). The
 * Glance widget itself isn't driven from here: add it via a long-press on the home screen, then
 * write a snapshot from `(dev)/spikes/app-group.tsx` to see it update. */
export default function AndroidSurfacesSpikeScreen() {
  const [status, setStatus] = useState<string | null>(null);
  const [fsiGranted, setFsiGranted] = useState<boolean | null>(null);
  const [exactAlarmGranted, setExactAlarmGranted] = useState<boolean | null>(null);

  const withErrorHandling = useCallback((label: string, run: () => void) => {
    try {
      run();
      setStatus(`${label}: ok`);
    } catch (cause) {
      setStatus(`${label}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }, []);

  const checkFsi = useCallback(() => {
    withErrorHandling('checkFsi', () => setFsiGranted(canUseFullScreenIntent()));
  }, [withErrorHandling]);

  const checkExactAlarm = useCallback(() => {
    withErrorHandling('checkExactAlarm', () => setExactAlarmGranted(canScheduleExactAlarms()));
  }, [withErrorHandling]);

  const scheduleAlarm = useCallback(() => {
    withErrorHandling(`scheduleFullScreenAlarm(${ALARM_DELAY_SECONDS}s)`, () =>
      scheduleFullScreenAlarm(ALARM_DELAY_SECONDS),
    );
  }, [withErrorHandling]);

  const cancelAlarm = useCallback(() => {
    withErrorHandling('cancelFullScreenAlarm', cancelFullScreenAlarm);
  }, [withErrorHandling]);

  const simulatePush = useCallback(
    (op: LiveUpdatePushPayload['op']) => {
      withErrorHandling(`simulateLiveUpdatePush(${op})`, () =>
        simulateLiveUpdatePush({
          type: 'la.leaveby',
          op,
          state: { progress: op === 'update' ? 3 : 1, progressMax: 4, chip: '12 min' },
        }),
      );
    },
    [withErrorHandling],
  );

  const dismissPush = useCallback(() => {
    withErrorHandling('dismissLiveUpdate', dismissLiveUpdate);
  }, [withErrorHandling]);

  return (
    <Scaffold edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text accessibilityRole="header" variant="h3">
          Android surfaces spike
        </Text>
        <Text variant="bodySm">Running on API {String(Platform.Version)}.</Text>

        <Text variant="title">Full-screen-intent alarm</Text>
        <View style={styles.buttonRow}>
          <PillButton
            variant="secondary"
            size="sm"
            label="Check FSI permission"
            onPress={checkFsi}
          />
        </View>
        {fsiGranted !== null ? (
          <Text variant="bodySm">{fsiGranted ? 'Granted' : 'Denied — needs Settings'}</Text>
        ) : null}
        {fsiGranted === false ? (
          <View style={styles.buttonRow}>
            <PillButton
              variant="secondary"
              size="sm"
              label="Open FSI settings"
              onPress={openFullScreenIntentSettings}
            />
          </View>
        ) : null}

        <View style={styles.buttonRow}>
          <PillButton
            variant="secondary"
            size="sm"
            label="Check exact-alarm permission"
            onPress={checkExactAlarm}
          />
        </View>
        {exactAlarmGranted !== null ? (
          <Text variant="bodySm">{exactAlarmGranted ? 'Granted' : 'Denied — needs Settings'}</Text>
        ) : null}
        {exactAlarmGranted === false ? (
          <View style={styles.buttonRow}>
            <PillButton
              variant="secondary"
              size="sm"
              label="Open exact-alarm settings"
              onPress={openExactAlarmSettings}
            />
          </View>
        ) : null}

        <View style={styles.buttonRow}>
          <PillButton
            variant="secondary"
            size="sm"
            label={`Schedule alarm in ${ALARM_DELAY_SECONDS}s`}
            onPress={scheduleAlarm}
          />
        </View>
        <View style={styles.buttonRow}>
          <PillButton variant="secondary" size="sm" label="Cancel alarm" onPress={cancelAlarm} />
        </View>

        <Text variant="title">Live Update push (local test hook)</Text>
        <Text variant="bodySm">
          No Firebase project exists in this environment, so this calls the exact same
          `AndroidSurfacesPushReceiver.handle` a real FCM data message would reach — same parsing,
          same notifier, only the transport differs.
        </Text>
        <View style={styles.buttonRow}>
          <PillButton
            variant="secondary"
            size="sm"
            label="Start Live Update"
            onPress={() => simulatePush('start')}
          />
        </View>
        <View style={styles.buttonRow}>
          <PillButton
            variant="secondary"
            size="sm"
            label="Update Live Update"
            onPress={() => simulatePush('update')}
          />
        </View>
        <View style={styles.buttonRow}>
          <PillButton
            variant="secondary"
            size="sm"
            label="End Live Update"
            onPress={() => simulatePush('end')}
          />
        </View>
        <View style={styles.buttonRow}>
          <PillButton
            variant="secondary"
            size="sm"
            label="Dismiss notification"
            onPress={dismissPush}
          />
        </View>

        {status ? <Text variant="bodySm">{status}</Text> : null}

        <Text variant="title">Glance widget</Text>
        <Text variant="bodySm">
          Long-press the home screen → widgets → CritterPass spike, then write a snapshot from the
          cp-app-group spike screen to see it update.
        </Text>

        <Text variant="title">Founder checklist (physical API 36+ device)</Text>
        <Text variant="bodySm">
          1. Set GOOGLE_APPLICATION_CREDENTIALS + FCM_TEST_DEVICE_TOKEN and run{'\n'}
          {'   '}pnpm --filter @cp/spikes run android-surfaces{'\n'}
          2. Confirm the Live Update renders as a promoted ongoing notification from a real push.
          {'\n'}
          3. Grant FSI + exact alarm via Settings, schedule the alarm, lock the device, and confirm
          the alarm activity shows over the lock screen at the scheduled time.
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
