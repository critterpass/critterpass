/**
 * Once a year (3l-9) over synced rows: legendary windows, my finds, my pending legendary
 * reminders (REMIND ME queues `set_legendary_reminder` for every dated window not found yet, and
 * shows at once, offline too), the next trip's months, and a crew co-presence legendary's count.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- the notifications module loads lazily, so importing this never forces it under Jest. */
import { upper } from '@cp/i18n';
import type * as NotificationsModule from 'expo-notifications';
import { useEffect, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion';
import { ScreenLoading } from '@/ui/states/ScreenLoading';

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
import { backToDex } from '../dex/dex-copy';
import { deviceTimeZone } from '../hatch/hatch-model';
import { PASS_TAB } from '../routes';
import { remindersSet } from './legendary-copy';
import {
  buildLegendaries,
  REMINDERS_SQL,
  REMINDERS_TABLES,
  stripMonths,
  WINDOW_ART_SQL,
  WINDOW_ART_TABLES,
  type WindowArtRow,
} from './legendary-model';
import { LegendaryView } from './legendary-view';

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

export function LegendaryScreen({ now = () => new Date() }: { readonly now?: () => Date }) {
  const uid = useOwnerUid();
  const locale = useLocale();
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
  if (!windows.loaded) {
    return (
      <ScreenLoading
        backLabel={upper(backToDex(), locale)}
        fallback={PASS_TAB}
        testID="critters-legendaries-loading"
      />
    );
  }

  const reminders = new Set(synced.map((r) => r.target_id));
  for (const [id, on] of overrides) {
    if (on) reminders.add(id);
    else reminders.delete(id);
  }
  const current = now();
  const items = buildLegendaries({
    windows: windows.rows,
    art,
    entries,
    reminders,
    trip,
    now: current,
    tz: deviceTimeZone(),
    copresence,
  });
  const remindable = items.filter((i) => i.label.kind !== 'any' && !i.found);
  const allReminded = remindable.length > 0 && remindable.every((i) => i.reminder);

  const onRemind = () => {
    const on = !allReminded;
    const targets = remindable.filter((i) => i.reminder !== on);
    const next = new Map(overrides);
    for (const item of targets) {
      next.set(item.windowId, on);
      void command.send({ window_id: item.windowId, on });
    }
    setOverrides(next);
    if (on && targets.length > 0) {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast de-dupe key, never copy.
      toast.show({ id: `critters-remind-${targets.length}`, title: remindersSet(targets.length) });
    }
  };

  return (
    <LegendaryView
      items={items}
      months={stripMonths(items, trip, current.getMonth() + 1)}
      allReminded={allReminded}
      notificationsOff={notificationsOff}
      onRemind={onRemind}
    />
  );
}
