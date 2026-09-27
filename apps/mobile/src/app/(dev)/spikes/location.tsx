import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ScrollView, StyleSheet, Text, View } from 'react-native';

import { reloadWidgets, writeSnapshot } from '../../../../modules/cp-app-group';
import type { DwellState } from './dwell-ring';
import { haversineMeters } from './dwell-ring';
import {
  DEFAULT_DWELL_CONFIG,
  LOCATION_TASK_NAME,
  configureDwellTarget,
  getDwellSnapshot,
  subscribeDwellUpdates,
} from './dwell-location-task';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const SNAPSHOT_SCHEMA = 1;

type PermissionLevel = 'unknown' | 'denied' | 'foreground' | 'always';

function toPermissionLevel(
  foreground: Location.PermissionStatus,
  background: Location.PermissionStatus | null,
): PermissionLevel {
  if (background === Location.PermissionStatus.GRANTED) return 'always';
  if (foreground === Location.PermissionStatus.GRANTED) return 'foreground';
  if (foreground === Location.PermissionStatus.DENIED) return 'denied';
  return 'unknown';
}

export default function LocationDwellSpikeScreen() {
  const [permission, setPermission] = useState<PermissionLevel>('unknown');
  const [tracking, setTracking] = useState(false);
  const [poi, setPoi] = useState<{ lat: number; lon: number } | null>(null);
  const [dwell, setDwell] = useState<DwellState | null>(null);
  const [fix, setFix] = useState<Location.LocationObject | null>(null);
  const [snapshotMs, setSnapshotMs] = useState<number | null>(null);
  const lastNotifiedTier = useRef(-1);

  useEffect(() => {
    const unsubscribe = subscribeDwellUpdates((state, latestFix) => {
      setDwell(state);
      setFix(latestFix);

      // Proves the wiring to the App Group snapshot cp-app-group already writes for T7's widget
      // timeline provider (T8) — the real ActivityKit Live Activity update on a locked screen still
      // needs that widget target reading this key and, for a push-driven update, the APNs
      // credentials T9's ADR records as missing in this environment.
      const tier = Math.floor(state.progress * 4); // 0,1,2,3,4 (4 = complete)
      if (tier !== lastNotifiedTier.current) {
        lastNotifiedTier.current = tier;
        const start = performance.now();
        writeSnapshot(
          'dwell_ring',
          JSON.stringify({
            schema: SNAPSHOT_SCHEMA,
            progress: state.progress,
            dwell_seconds: state.dwellSeconds,
            generated_at: new Date().toISOString(),
          }),
        );
        reloadWidgets();
        setSnapshotMs(performance.now() - start);
      }
    });
    return unsubscribe;
  }, []);

  const requestForeground = useCallback(async () => {
    const result = await Location.requestForegroundPermissionsAsync();
    setPermission(toPermissionLevel(result.status, null));
  }, []);

  const requestAlways = useCallback(async () => {
    const result = await Location.requestBackgroundPermissionsAsync();
    setPermission((current) =>
      result.status === Location.PermissionStatus.GRANTED ? 'always' : current,
    );
  }, []);

  const setPoiFromCurrentLocation = useCallback(async () => {
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const nextPoi = { lat: current.coords.latitude, lon: current.coords.longitude };
    setPoi(nextPoi);
    configureDwellTarget(nextPoi, DEFAULT_DWELL_CONFIG);
    lastNotifiedTier.current = -1;
  }, []);

  const startTracking = useCallback(async () => {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
      distanceInterval: 10,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'CritterPass trip day',
        notificationBody: 'Tracking nearby critter encounters for this spike.',
      },
    });
    setTracking(true);
  }, []);

  const stopTracking = useCallback(async () => {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
    setTracking(false);
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const snapshot = getDwellSnapshot();
      setDwell(snapshot.state);
      setFix(snapshot.fix);
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const distanceMeters =
    poi && fix
      ? haversineMeters({ lat: fix.coords.latitude, lon: fix.coords.longitude }, poi)
      : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Background location + dwell ring spike
      </Text>
      <Text style={styles.body}>permission: {permission}</Text>

      <View style={styles.buttonRow}>
        <Button
          title="Enable location (While-In-Use)"
          onPress={() => void requestForeground()}
          disabled={permission !== 'unknown' && permission !== 'denied'}
        />
      </View>
      {permission === 'foreground' || permission === 'always' ? (
        <View style={styles.buttonRow}>
          <Button
            title="Enable background tracking (Always)"
            onPress={() => void requestAlways()}
            disabled={permission === 'always'}
          />
        </View>
      ) : null}
      <View style={styles.buttonRow}>
        <Button
          title="Use current location as POI"
          onPress={() => void setPoiFromCurrentLocation()}
          disabled={permission === 'unknown' || permission === 'denied'}
        />
      </View>
      <View style={styles.buttonRow}>
        <Button
          title={tracking ? 'Stop trip-day session' : 'Start trip-day session'}
          onPress={() => void (tracking ? stopTracking() : startTracking())}
          disabled={!poi}
        />
      </View>

      {poi ? (
        <Text style={styles.body}>
          POI: {poi.lat.toFixed(6)}, {poi.lon.toFixed(6)} (radius{' '}
          {DEFAULT_DWELL_CONFIG.radiusMeters} m)
        </Text>
      ) : (
        <Text style={styles.body}>No POI set yet.</Text>
      )}
      {fix ? (
        <Text style={styles.body}>
          last fix: {fix.coords.latitude.toFixed(6)}, {fix.coords.longitude.toFixed(6)} (±
          {fix.coords.accuracy?.toFixed(0) ?? '?'} m) at{' '}
          {new Date(fix.timestamp).toLocaleTimeString()}
        </Text>
      ) : null}
      {distanceMeters !== null ? (
        <Text style={styles.body}>distance to POI: {distanceMeters.toFixed(1)} m</Text>
      ) : null}

      <View style={styles.resultBox}>
        <Text style={styles.resultLabel}>dwell ring</Text>
        <Text style={styles.resultValue}>
          {dwell ? `${(dwell.progress * 100).toFixed(0)}%` : '0%'}
        </Text>
        <Text style={styles.body}>
          {dwell
            ? `${dwell.dwellSeconds.toFixed(0)}s / ${DEFAULT_DWELL_CONFIG.thresholdSeconds}s`
            : ''}
        </Text>
      </View>
      {snapshotMs !== null ? (
        <Text style={styles.body}>last App Group snapshot write: {snapshotMs.toFixed(2)} ms</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: 10, padding: 16, alignItems: 'flex-start' },
  title: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 13 },
  buttonRow: { alignSelf: 'stretch' },
  resultBox: {
    gap: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    alignSelf: 'stretch',
  },
  resultLabel: { fontSize: 12, textTransform: 'uppercase', opacity: 0.6 },
  resultValue: { fontSize: 28, fontWeight: '700' },
});
