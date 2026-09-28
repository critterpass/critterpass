import { useCallback, useEffect, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import { requestWithPrimer, type PermissionTrigger } from '@/lib/permissions';

import {
  getPermissions,
  PERMISSION_KINDS,
  type PermissionKind,
  type PermissionSnapshot,
} from '../../../modules/cp-permissions';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/**
 * Live status of every permission kind straight from cp-permissions (no primer): request, open
 * the kind's Settings screen, and watch the list refresh when the app returns from Settings.
 */
/** The just-in-time trigger each kind is asked at (Settings for the ones asked from there). */
const TRIGGER: Readonly<Record<PermissionKind, PermissionTrigger>> = {
  notifications: 'first_vote',
  alarms: 'first_leave_by',
  location: 'trip_start',
  calendar: 'date_finding',
  camera: 'real_photo',
  microphone: 'voice',
  speech: 'voice',
  photos_add: 'save_image',
  photos_read: 'album_ingest',
  live_activities: 'settings',
};

export default function PermissionsDevScreen() {
  const [snapshot, setSnapshot] = useState<PermissionSnapshot | null>(null);
  const api = getPermissions();

  useEffect(() => api.watch(setSnapshot), [api]);

  const refresh = useCallback(async () => setSnapshot(await api.snapshot()), [api]);
  const ask = useCallback(
    async (kind: PermissionKind, level?: 'always' | 'provisional') => {
      await api.request(kind, level);
      await refresh();
    },
    [api, refresh],
  );

  return (
    <ScrollView contentContainerStyle={styles.container} testID="dev-permissions">
      <Text accessibilityRole="header" style={styles.title}>
        Permissions
      </Text>
      {PERMISSION_KINDS.map((kind) => {
        const report = snapshot?.reports[kind];
        return (
          <View key={kind} style={styles.row} testID={`dev-permission-${kind}`}>
            <Text style={styles.kind}>{kind}</Text>
            <Text style={styles.body} testID={`dev-permission-${kind}-status`}>
              {report === undefined
                ? '…'
                : `${report.status}${report.canAskAgain ? '' : ' · settings only'}${
                    report.available ? '' : ' · unavailable'
                  }${report.level !== undefined ? ` · ${report.level}` : ''}${
                    report.precise === false ? ' · approximate' : ''
                  }`}
            </Text>
            <View style={styles.buttons}>
              <Button
                testID={`dev-permission-${kind}-primer`}
                title="Primer"
                onPress={() => void requestWithPrimer(kind, TRIGGER[kind]).then(refresh)}
              />
              <Button title="Request" onPress={() => void ask(kind)} />
              {kind === 'location' ? (
                <Button title="Always" onPress={() => void ask(kind, 'always')} />
              ) : null}
              <Button
                title="Settings"
                onPress={() => void api.openSettings(api.settingsTargetFor(kind))}
              />
            </View>
          </View>
        );
      })}
      <Text style={styles.body} testID="dev-permissions-capabilities">
        {JSON.stringify({ alarms: snapshot?.alarms, liveActivities: snapshot?.liveActivities })}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  row: { gap: 4, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 },
  kind: { fontSize: 16, fontWeight: '600' },
  body: { fontSize: 14 },
  buttons: { flexDirection: 'row', gap: 8 },
});
