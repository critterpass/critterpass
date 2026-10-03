/**
 * Bridges the root layout mounts for the signed-in session: device permissions mirrored to the
 * server, and the trip-day location engine with its visits. The native modules come in as ports
 * from the layout, which alone may reach them.
 */
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { deviceSessionUid, uploadLocationFixes } from '@/data/app-session/device-session';
import { useCommand } from '@/data/commands/use-command';
import { watchRows } from '@/data/status/watch-rows';
import type { AnalyticsClient } from '@/lib/analytics';
import {
  countryOf,
  RECORD_VISIT,
  readLocationFlags,
  SET_CONSENT,
  trackLocationSession,
  trackVisitRecorded,
  useAppActive,
  useExploreAtHome,
  useLocationEngineBridge,
  useVisitBridge,
  useVisitConsentRows,
  visitConsentGranted,
  visitConsentPayload,
  type RowWatcher,
} from '@/lib/location';
import {
  UPDATE_DEVICE_PERMISSIONS,
  usePermission,
  usePermissionsBridge,
  type DevicePermissionState,
} from '@/lib/permissions';
import { VisitConsentHost } from '@/ui/permission-primer';

type LocationSessionPort = Parameters<typeof useLocationEngineBridge>[0]['session'];
type PermissionsPort = Parameters<typeof usePermissionsBridge>[0];

/** The trip-day location engine over the native session, fed from synced rows. */
export function LocationBridge({
  db,
  session,
  analytics,
}: {
  readonly db: Parameters<typeof watchRows>[0];
  readonly session: LocationSessionPort;
  readonly analytics: AnalyticsClient;
}) {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => void deviceSessionUid().then(setUid, () => setUid(null)), []);
  const watch = useCallback<RowWatcher>(
    (sql, tables, onRows) => watchRows(db, sql, tables, onRows),
    [db],
  );
  const location = usePermission('location').report;
  const { engine, plan } = useLocationEngineBridge({
    session,
    upload: uploadLocationFixes,
    platform: Platform.OS === 'android' ? 'android' : 'ios',
    watch,
    uid,
    level: location?.status === 'granted' ? (location.level ?? 'none') : 'none',
    appActive: useAppActive(),
    deviceTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    exploreAtHome: useExploreAtHome(),
    androidBackgroundGeofences: readLocationFlags(analytics).androidBackgroundGeofences,
    countryOf,
    onSessionEnded: (summary) => trackLocationSession(analytics, summary),
  });
  const consentRows = useVisitConsentRows(watch);
  const { send: sendVisit } = useCommand(RECORD_VISIT);
  const { send: sendConsent } = useCommand(SET_CONSENT);
  useVisitBridge({
    engine,
    plan,
    consentGranted: visitConsentGranted(consentRows),
    send: sendVisit,
    track: (source) => trackVisitRecorded(analytics, source),
  });
  return (
    <VisitConsentHost
      decided={consentRows.length > 0}
      onAnswer={(granted) => void sendConsent(visitConsentPayload(granted))}
    />
  );
}

export function PermissionsBridge({ permissions }: { readonly permissions: PermissionsPort }) {
  const { send } = useCommand(UPDATE_DEVICE_PERMISSIONS);
  const sendMirror = useCallback((perms: DevicePermissionState) => send({ perms }), [send]);
  usePermissionsBridge(permissions, sendMirror);
  return null;
}
