/**
 * Keeps this phone's leave-by alarms in step with the synced rows, app-wide: picks how alarms ring
 * here (the native module, a local notification, or the app's own screen), schedules one for every
 * leave-by I'm on while I'm not up, cancels it the moment I'm up anywhere, moves it when the
 * leave-by moves, and mirrors each change to the server. The chosen mode is logged as a
 * breadcrumb so a report shows how the alarm was meant to ring.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, flag keys and log events, never copy. */
import * as Sentry from '@sentry/react-native';
import * as Notifications from 'expo-notifications';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { createDeviceResolver } from '@/data/commands/device';
import type { GuideId } from '@/ui/people/GuideLine';
import { guideColour, guideOr } from '../hub/guide';
import { useLiveRows } from '../hub/data/live-rows';
import { useLocale } from '@/lib/i18n/use-locale';

import { alarmPort } from './alarm-port';
import { mirrorAlarmStateCommand } from '../leave-by/commands';
import type { LeaveByRow, LeaveByView, ReadinessRow } from '../leave-by/model';
import {
  LEAVE_BY_TABLES,
  leaveByViews,
  MY_READINESS_SQL,
  PENDING_DAY_SQL,
  PENDING_TABLES,
  pendingDay,
  READINESS_TABLES,
  UPCOMING_LEAVE_BYS_SQL,
} from '../leave-by/use-leave-by';
import { chooseBackend } from './alarm-backends';
import { alarmText } from './alarm-copy';
import { desiredAlarms } from './alarm-plan';
import { alarmStore, useAlarmState } from './alarm-store';
import { syncAlarms, type MirroredAlarm } from './alarm-sync';

const GUIDES_SQL = `SELECT t.id AS trip_id, g.slug, g.name FROM trips t
  LEFT JOIN guides g ON g.id = t.guide_id`;
const GUIDES_TABLES = ['trips', 'guides'];
const MIRROR_SQL = `SELECT leave_by_id, fire_at, state FROM alarms WHERE device_id = ?`;
const FLAG_SQL = `SELECT value FROM client_config WHERE key = 'android_fsi_alarm'`;
const THROUGH_DND_SQL = `SELECT leave_by_through_dnd FROM user_settings WHERE user_id = ?`;

const resolveDevice = createDeviceResolver();

async function notificationPermission() {
  const result = await Notifications.getPermissionsAsync();
  return { granted: result.granted, canAsk: result.canAskAgain };
}

export interface AlarmSyncState {
  readonly views: readonly LeaveByView[];
  readonly guideFor: (tripId: string) => { readonly slug: GuideId; readonly name: string };
}

export function useAlarmSync(me: string | null): AlarmSyncState {
  const locale = useLocale();
  const { snoozedUntil, generation } = useAlarmState();
  const { send: mirror } = useCommand(mirrorAlarmStateCommand);
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60_000));
  const [deviceId, setDeviceId] = useState<string | null>(null);
  useEffect(() => {
    resolveDevice().then(
      (device) => setDeviceId(device.id),
      () => setDeviceId(null),
    );
    const timer = setInterval(() => setMinute(Math.floor(Date.now() / 60_000)), 30_000);
    const app = AppState.addEventListener('change', (next) => {
      if (next === 'active') alarmStore.resync();
    });
    return () => {
      clearInterval(timer);
      app.remove();
    };
  }, []);

  const since = useMemo(() => new Date((minute - 60) * 60_000).toISOString(), [minute]);
  const rows = useLiveRows<LeaveByRow>(UPCOMING_LEAVE_BYS_SQL, [since], LEAVE_BY_TABLES);
  const readiness = useLiveRows<ReadinessRow>(
    MY_READINESS_SQL,
    me === null ? null : [me],
    READINESS_TABLES,
  );
  const pending = useLiveRows<Parameters<typeof pendingDay>[0][number]>(
    PENDING_DAY_SQL,
    [],
    PENDING_TABLES,
  );
  const guides = useLiveRows<{ trip_id: string; slug: string | null; name: string | null }>(
    GUIDES_SQL,
    [],
    GUIDES_TABLES,
  );
  const mirrored = useLiveRows<{ leave_by_id: string; fire_at: string; state: string }>(
    MIRROR_SQL,
    deviceId === null ? null : [deviceId],
    ['alarms'],
  );
  const flag = useLiveRows<{ value: string | null }>(FLAG_SQL, [], ['client_config']);
  const fullScreen = flag.rows[0]?.value === 'true' || flag.rows[0]?.value === '1';
  const dnd = useLiveRows<{ leave_by_through_dnd: number | null }>(
    THROUGH_DND_SQL,
    me === null ? null : [me],
    ['user_settings'],
  );
  // On unless switched off (the column's default): the leave-by alarm always gets through.
  const throughDnd = dnd.rows[0]?.leave_by_through_dnd !== 0;

  const views = useMemo(
    () =>
      me === null
        ? []
        : leaveByViews({
            rows: rows.rows,
            readiness: readiness.rows,
            pending: pendingDay(pending.rows),
            members: [],
            me,
            now: new Date(minute * 60_000),
          }),
    [rows.rows, readiness.rows, pending.rows, me, minute],
  );
  const guideFor = useMemo(() => {
    const byTrip = new Map(guides.rows.map((row) => [row.trip_id, row]));
    return (tripId: string) => {
      const row = byTrip.get(tripId);
      const slug = guideOr(row?.slug);
      return { slug, name: row?.name ?? slug.charAt(0).toUpperCase() + slug.slice(1) };
    };
  }, [guides.rows]);

  const running = useRef<Promise<unknown>>(Promise.resolve());
  const ready = me !== null && rows.loaded && readiness.loaded;
  useEffect(() => {
    if (!ready) return;
    const desired = desiredAlarms(views, new Date(), snoozedUntil);
    const mirroredRows: MirroredAlarm[] = mirrored.rows.map((row) => ({
      leaveById: row.leave_by_id,
      fireAt: row.fire_at,
      state: row.state,
    }));
    running.current = running.current
      .then(async () => {
        const choice = await chooseBackend(
          alarmPort(),
          fullScreen,
          notificationPermission,
          throughDnd,
        );
        const next = desired[0];
        alarmStore.setStatus({
          ...choice.status,
          next: next === undefined ? null : { leaveById: next.leaveById, fireAt: next.fireAt },
        });
        Sentry.addBreadcrumb({
          category: 'alarm',
          level: 'info',
          message: `leave-by alarms ring as ${choice.status.mode}`,
          data: { engine: choice.status.engine ?? 'none', denied: choice.status.denied },
        });
        await syncAlarms(desired, {
          backend: choice.backend,
          text: (alarm) => alarmText(alarm, guideFor(alarm.tripId).name, locale),
          tint: (alarm) => guideColour(guideFor(alarm.tripId).slug),
          deviceId,
          mirrored: mirroredRows,
          mirror: (payload) => mirror(payload),
          log: (event, detail) =>
            Sentry.addBreadcrumb({
              category: 'alarm',
              level: 'info',
              message: event,
              data: detail,
            }),
        });
      })
      .catch(() => undefined);
    // `mirrored` rows are read at run time; a new mirror row alone never needs another pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    views,
    snoozedUntil,
    fullScreen,
    throughDnd,
    deviceId,
    generation,
    locale,
    guideFor,
    mirror,
  ]);

  return { views, guideFor };
}
