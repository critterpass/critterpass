/**
 * The device calendar's part in setup: ask for calendar access through the permission
 * orchestrator (its primer first), read the device's calendars reduced on the device to one
 * free / maybe / busy per date, and send them with `set_availability` (queued when offline). It
 * re-reads when setup opens and whenever the app comes back to the foreground, if the last read is
 * over six hours old. Nothing but dates and states leaves the device.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI state machine: status discriminants. */
import { getCalendars } from 'expo-localization';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { deviceTimeZone } from '@/data/commands/device';
import { usePermission } from '@/lib/permissions/use-permission';

import { setAvailabilityCommand } from '../data/commands';
import { useDeviceCalendar } from './device-calendar';
import { useCalendarPrefs, writeLastSync } from './prefs';
import { devicePayload, isStale, syncRange } from './sync-plan';

export type CalendarSyncStatus =
  /** This build has no device calendar reader: mark days by hand. */
  | 'unavailable'
  /** Not asked yet (or asked and dismissed): the connect button. */
  | 'needs_permission'
  /** The OS said no: Settings, or mark days by hand. */
  | 'denied'
  | 'syncing'
  | 'synced'
  | 'error';

export interface CalendarSync {
  readonly status: CalendarSyncStatus;
  readonly lastSyncedAt: Date | null;
  /** Tentative events are shared as "maybe busy" (opt-in, per device). */
  readonly tentative: boolean;
  readonly setTentative: (next: boolean) => void;
  /** Asks for access (primer first), then syncs. */
  readonly connect: () => Promise<void>;
  readonly sync: () => Promise<void>;
  readonly openSettings: () => Promise<boolean>;
}

type Phase = 'idle' | 'syncing' | 'error';

export function useCalendarSync(
  tripId: string,
  options: { readonly now?: () => number } = {},
): CalendarSync {
  const now = options.now ?? Date.now;
  const calendar = useDeviceCalendar();
  const permission = usePermission('calendar');
  const prefs = useCalendarPrefs();
  const { send } = useCommand(setAvailabilityCommand);
  const [phase, setPhase] = useState<Phase>('idle');
  const running = useRef(false);

  // The native reader is the truth; the permission store re-renders this hook when access changes.
  const granted = calendar !== null && calendar.hasAccess();

  const run = useCallback(
    async (tentative: boolean) => {
      if (calendar === null || running.current || !calendar.hasAccess()) return;
      running.current = true;
      setPhase('syncing');
      try {
        const at = now();
        const tz = deviceTimeZone(getCalendars()[0]?.timeZone);
        const days = await calendar.readBusyDays(syncRange(new Date(at), tz), tentative);
        const sent = await send(devicePayload(tripId, days, tentative));
        if (sent.kind === 'rejected') throw new Error(sent.code);
        writeLastSync(at);
        setPhase('idle');
      } catch {
        setPhase('error');
      } finally {
        running.current = false;
      }
    },
    [calendar, now, send, tripId],
  );

  const sync = useCallback(() => run(prefs.tentative), [run, prefs.tentative]);

  const connect = useCallback(async () => {
    if (calendar === null) return;
    if (!calendar.hasAccess()) {
      const outcome = await permission.request('date_finding');
      if (outcome.result !== 'granted' && !calendar.hasAccess()) return;
    }
    await run(prefs.tentative);
  }, [calendar, permission, run, prefs.tentative]);

  const setTentative = useCallback(
    (next: boolean) => {
      prefs.setTentative(next);
      if (granted) void run(next);
    },
    [prefs, granted, run],
  );

  // Setup opened, or the app came back: re-read a stale calendar.
  const latest = useRef({ granted, lastSyncedAt: prefs.lastSyncedAt, sync });
  useLayoutEffect(() => {
    latest.current = { granted, lastSyncedAt: prefs.lastSyncedAt, sync };
  });
  useEffect(() => {
    const maybeSync = () => {
      const current = latest.current;
      if (current.granted && isStale(current.lastSyncedAt, now())) void current.sync();
    };
    maybeSync();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') maybeSync();
    });
    return () => subscription.remove();
  }, [now]);

  return {
    status: statusOf(calendar !== null, granted, phase, prefs.lastSyncedAt, permission.report),
    lastSyncedAt: prefs.lastSyncedAt,
    tentative: prefs.tentative,
    setTentative,
    connect,
    sync,
    openSettings: permission.openSettings,
  };
}

function statusOf(
  available: boolean,
  granted: boolean,
  phase: Phase,
  lastSyncedAt: Date | null,
  report: { readonly status: string; readonly canAskAgain: boolean } | undefined,
): CalendarSyncStatus {
  if (!available) return 'unavailable';
  if (phase === 'syncing') return 'syncing';
  if (phase === 'error') return 'error';
  if (granted) return lastSyncedAt === null ? 'syncing' : 'synced';
  if (report?.status === 'denied' || report?.status === 'restricted') return 'denied';
  return 'needs_permission';
}
