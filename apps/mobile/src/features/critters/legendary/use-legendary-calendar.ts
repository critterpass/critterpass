/**
 * The legendary calendar's data for any view of it: every legendary window with my finds and
 * reminders (pending changes from this phone first), the month strip, whether notifications are
 * off, and `toggleAll()`, which turns reminders on (or off) for every legendary still to find and
 * queues `set_legendary_reminder` for each. It returns how many were newly turned on.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- the notifications module loads lazily, so importing this never forces it under Jest. */
import type * as NotificationsModule from 'expo-notifications';
import { useEffect, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';

import { useCopresence } from '../copresence/use-copresence';
import { setLegendaryReminderCommand } from '../data/commands';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import {
  ENTRIES_SQL,
  ENTRIES_TABLES,
  TRIPS_SQL,
  TRIPS_TABLES,
  WINDOWS_SQL,
  WINDOWS_TABLES,
  type EntryRow,
  type TripRow,
  type WindowRow,
} from '../data/queries';
import { deviceTimeZone } from '../hatch/hatch-model';
import {
  buildLegendaries,
  REMINDERS_SQL,
  REMINDERS_TABLES,
  stripMonths,
  WINDOW_ART_SQL,
  WINDOW_ART_TABLES,
  type LegendaryItem,
  type WindowArtRow,
} from './legendary-model';

function useNotificationsOff(): boolean {
  const [off, setOff] = useState(false);
  useEffect(() => {
    try {
      const notifications = require('expo-notifications') as typeof NotificationsModule;
      void notifications.getPermissionsAsync().then(
        (p: { granted?: boolean } | undefined) => setOff(p?.granted === false),
        () => undefined,
      );
    } catch {
      // No notifications module: reminders still land in the inbox.
    }
  }, []);
  return off;
}

export interface LegendaryCalendar {
  readonly loaded: boolean;
  readonly items: readonly LegendaryItem[];
  readonly months: ReturnType<typeof stripMonths>;
  readonly allReminded: boolean;
  readonly notificationsOff: boolean;
  /** Reminders on for every legendary still to find, or all off; how many were turned on. */
  readonly toggleAll: () => number;
}

export function useLegendaryCalendar(now: () => Date): LegendaryCalendar {
  const uid = useOwnerUid();
  const mine = uid === null ? null : [uid];
  const windows = useLiveRows<WindowRow>(WINDOWS_SQL, [], WINDOWS_TABLES);
  const art = useLiveRows<WindowArtRow>(WINDOW_ART_SQL, [], WINDOW_ART_TABLES).rows;
  const entries = useLiveRows<EntryRow>(ENTRIES_SQL, mine, ENTRIES_TABLES).rows;
  const trips = useLiveRows<TripRow>(TRIPS_SQL, mine, TRIPS_TABLES).rows;
  const synced = useLiveRows<{ target_id: string }>(REMINDERS_SQL, mine, REMINDERS_TABLES).rows;
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
  const command = useCommand(setLegendaryReminderCommand);
  const notificationsOff = useNotificationsOff();
  const trip = trips.find((t) => t.status === 'in_trip') ?? trips[0] ?? null;
  const copresence = useCopresence(trip?.status === 'in_trip' ? trip.id : null);

  const reminders = new Set(synced.map((r) => r.target_id));
  for (const [id, on] of overrides) {
    if (on) reminders.add(id);
    else reminders.delete(id);
  }
  const current = now();
  const items = windows.loaded
    ? buildLegendaries({
        windows: windows.rows,
        art,
        entries,
        reminders,
        trip,
        now: current,
        tz: deviceTimeZone(),
        copresence,
      })
    : [];
  const remindable = items.filter((i) => i.label.kind !== 'any' && !i.found);
  const allReminded = remindable.length > 0 && remindable.every((i) => i.reminder);

  const toggleAll = () => {
    const on = !allReminded;
    const targets = remindable.filter((i) => i.reminder !== on);
    const next = new Map(overrides);
    for (const item of targets) {
      next.set(item.windowId, on);
      void command.send({ window_id: item.windowId, on });
    }
    setOverrides(next);
    return on ? targets.length : 0;
  };

  return {
    loaded: windows.loaded,
    items,
    months: stripMonths(items, trip, current.getMonth() + 1),
    allReminded,
    notificationsOff,
    toggleAll,
  };
}
