import { useEffect, useMemo, useState } from 'react';
import * as Updates from 'expo-updates';
import { Button, DevSettings, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getLocationNative, hasNativeSession } from '../../../modules/cp-location';
import { getPermissions, type KindReport } from '../../../modules/cp-permissions';
import {
  createLocationEngine,
  createVisitDetector,
  offerAlwaysUpgrade,
  type DetectedVisit,
  type EngineFix,
  type EngineRegionEvent,
  type EngineStatus,
  type VisitCandidate,
} from '@/lib/location';
import { getPermissionStore } from '@/lib/permissions';
import { VisitConsentSheet } from '@/ui/permission-primer';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

const TRIP_ID = '01928f3e-7b1a-7c2d-8e9f-0a1b2c3d4e5f';
/** Pura Taman Saraswati, Ubud: the POI e2e/location/walk-ubud.gpx dwells at. */
const SARASWATI: VisitCandidate = {
  id: '01928f3e-7b1a-7c2d-8e9f-0a1b2c3d4e62',
  lat: -8.5064,
  lng: 115.261,
  radiusM: 80,
  category: 'temple_shrine',
};

/**
 * The location engine on a synthetic trip day (today, in the device zone) around one Ubud POI:
 * start/stop the session, watch fixes, regions and visit arrivals from a GPX walk or Maestro
 * `setLocation`, and try the Always upgrade. No server calls: shares are off here.
 */
export default function LocationEngineDevScreen() {
  // Read straight from the OS: this screen works without a signed-in session. The snapshot also
  // goes into the permission store, which the Always offer checks and which only the session's
  // permissions bridge fills otherwise.
  const [location, setLocation] = useState<KindReport | null>(null);
  useEffect(
    () =>
      getPermissions().watch((snapshot) => {
        getPermissionStore().setSnapshot(snapshot);
        setLocation(snapshot.reports.location);
      }),
    [],
  );
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [lastFix, setLastFix] = useState<EngineFix | null>(null);
  const [regions, setRegions] = useState<readonly EngineRegionEvent[]>([]);
  const [visits, setVisits] = useState<readonly string[]>([]);
  const [on, setOn] = useState(false);
  const [consent, setConsent] = useState<'hidden' | 'showing' | 'on' | 'off'>('hidden');
  const engine = useMemo(
    () =>
      createLocationEngine({
        session: getLocationNative(),
        upload: () => Promise.resolve({ status: 202 }),
        platform: Platform.OS === 'android' ? 'android' : 'ios',
      }),
    [],
  );

  useEffect(() => {
    const stopStatus = engine.subscribeStatus(() => setStatus(engine.status()));
    const detector = createVisitDetector({
      onArrived: (v: DetectedVisit) => setVisits((list) => [...list, `arrived ${v.category}`]),
      onLeft: (v: DetectedVisit) => setVisits((list) => [...list, `left ${v.dwellS}s`]),
      dwellMsFor: () => 60_000,
    });
    detector.setCandidates([SARASWATI]);
    const stopVisits = engine.subscribe('visit', {
      onFix: (fix) => {
        setLastFix(fix);
        detector.onFix(fix);
      },
      onRegion: (event) => {
        setRegions((list) => [...list, event]);
        detector.tick(Date.now());
      },
    });
    const ticker = setInterval(() => detector.tick(Date.now()), 10_000);
    return () => {
      clearInterval(ticker);
      stopStatus();
      stopVisits();
      void engine.dispose();
    };
  }, [engine]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    void engine.update({
      trip: on
        ? {
            status: 'in_trip',
            startDate: today,
            endDate: today,
            tz: null,
            destinationCountry: null,
          }
        : null,
      homeCountry: null,
      exploreAtHome: false,
      deviceTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      level: location?.status === 'granted' ? (location.level ?? 'none') : 'none',
      share: null,
      appActive: true,
      geofenceContext: { tripId: TRIP_ID, planPois: [SARASWATI], stay: null },
      androidBackgroundGeofences: true,
      window: { startMinute: 0, endMinute: 1440 },
    });
  }, [engine, on, location]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container} testID="dev-location-engine">
        <Text accessibilityRole="header" style={styles.title}>
          Location engine
        </Text>
        <Text testID="dev-location-native">
          {hasNativeSession() ? 'native session' : 'foreground fallback'}
        </Text>
        <Text testID="dev-location-permission">
          {`location: ${location?.status ?? '…'} ${location?.level ?? ''}`}
        </Text>
        <Text testID="dev-location-running">{`running: ${String(status?.running ?? false)}`}</Text>
        <Text testID="dev-location-mode">{`mode: ${status?.tripMode ?? 'off'} (${status?.reason ?? ''})`}</Text>
        <Text testID="dev-location-tier">{`tier: ${status?.tier ?? '-'}`}</Text>
        <Text testID="dev-location-regions">{`regions: ${status?.regions ?? 0}`}</Text>
        <Text testID="dev-location-fix">
          {lastFix === null
            ? 'fix: none'
            : `fix: ${lastFix.lat.toFixed(5)},${lastFix.lng.toFixed(5)} ±${Math.round(lastFix.acc)}m mock=${lastFix.mock}`}
        </Text>
        <Text testID="dev-location-region-events">
          {`region events: ${regions.map((r) => `${r.event}:${r.id}`).join(' ') || 'none'}`}
        </Text>
        <Text testID="dev-location-visits">{`visits: ${visits.join(', ') || 'none'}`}</Text>
        <View style={styles.buttons}>
          <Button testID="dev-location-start" title="Start trip day" onPress={() => setOn(true)} />
          <Button testID="dev-location-stop" title="Stop" onPress={() => setOn(false)} />
          <Button
            testID="dev-location-reload"
            title="Reload JS"
            onPress={() => (__DEV__ ? DevSettings.reload() : void Updates.reloadAsync())}
          />
          <Button
            testID="dev-location-consent"
            title="Visit consent"
            onPress={() => setConsent('showing')}
          />
          <Button
            testID="dev-location-always"
            title="Offer Always"
            onPress={() => void offerAlwaysUpgrade('first_encounter')}
          />
        </View>
        <Text testID="dev-location-consent-answer">{`consent: ${consent}`}</Text>
      </ScrollView>
      {consent === 'showing' ? (
        <VisitConsentSheet onAnswer={(granted) => setConsent(granted ? 'on' : 'off')} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
