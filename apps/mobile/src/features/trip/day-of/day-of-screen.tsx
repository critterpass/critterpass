/**
 * The day-of screen (3k-2) over synced rows: the day's leave-by with who is up, my alarm, the pack
 * list and the timeline. Every tap is a queued command, so the screen works the same with no
 * signal; the in-app alarm permission sheet opens from the alarm line.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { generateUuidV7, toLocalWallTime } from '@cp/domain';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { heroAt, useDestinationMedia } from '@/data/media/use-subject-media';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { useOwnerUid } from '../hub/data/live-rows';
import { guideOr } from '../hub/guide';
import { useLiveRows } from '../hub/data/live-rows';
import { useLocale } from '@/lib/i18n/use-locale';
import { openPermissionSettings, requestWithPrimer } from '@/lib/permissions';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';

import { alarmPort } from '../alarm/alarm-port';
import { AlarmPermissionSheet, type AlarmSheetKind } from '../alarm/alarm-permission-sheet';
import { alarmStore, useAlarmState } from '../alarm/alarm-store';
import {
  DAY_ITEMS_SQL,
  DAY_ITEMS_TABLES,
  MEMBERS_SQL,
  MEMBERS_TABLES,
  TRIP_SQL,
  TRIP_TABLES,
  type DayItemRow,
  type MemberRow,
  type TripRow,
} from '../hub/data/queries';
import { TODAY } from '../hub/routes';
import {
  addPackingItemCommand,
  checkPackingItemCommand,
  removePackingItemCommand,
  setReadinessCommand,
} from '../leave-by/commands';
import { useDayLeaveBys } from '../leave-by/use-leave-by';
import { useMediaLowData } from '../media/use-media-low-data';
import { alarmNoteFor, dayTimeline, forecastFor, pickLeaveBy } from './day-of-data';
import { dayEyebrow, forecastLabel } from './day-of-copy';
import { DayOfView } from './day-of-view';
import {
  buildPackChips,
  PENDING_PACKING_SQL,
  type PackingRow,
  type PendingPackingOp,
} from './packing-model';

const PACKING_SQL = `SELECT id, day, owner_id, label, checked, suggested_by, deleted_at
  FROM packing_items WHERE trip_id = ? ORDER BY created_at, id`;
const WEATHER_SQL = `SELECT elevation_m, hourly FROM weather_snapshots
  WHERE destination_id = ? AND date = ?`;

function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

export function DayOfScreen({ tripId, date }: { readonly tripId: string; readonly date: string }) {
  const me = useOwnerUid();
  const locale = useLocale();
  const now = useNow(1000);
  const sync = useSyncStatus();
  const alarm = useAlarmState();
  const [sheet, setSheet] = useState<AlarmSheetKind | null>(null);
  const trip = useLiveRows<TripRow>(TRIP_SQL, me === null ? null : [me, tripId], TRIP_TABLES);
  const tripRow = trip.rows[0] ?? null;
  const mediaLowData = useMediaLowData();
  const media = useDestinationMedia(tripRow?.destination_slug ?? null, {
    prefetch: !mediaLowData,
  });
  const tz = tripRow?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const minute = Math.floor(now.getTime() / 60_000);
  const localDate = useMemo(
    () => (date === TODAY ? toLocalWallTime(new Date(minute * 60_000), tz).date : date),
    [date, minute, tz],
  );
  const memberRows = useLiveRows<MemberRow>(
    MEMBERS_SQL,
    tripRow === null ? null : [tripRow.crew_id],
    MEMBERS_TABLES,
  );
  const members = useMemo(
    () =>
      memberRows.rows.map((row, index) => ({
        id: row.user_id,
        name: row.display_name ?? '',
        joinIndex: index,
      })),
    [memberRows.rows],
  );
  const leaveBys = useDayLeaveBys({ tripId, date: localDate, me, members, now });
  const packing = useLiveRows<PackingRow>(PACKING_SQL, [tripId], ['packing_items']);
  const pending = useLiveRows<PendingPackingOp>(PENDING_PACKING_SQL, [], ['commands']);
  const items = useLiveRows<DayItemRow>(
    DAY_ITEMS_SQL,
    tripRow?.current_version_id == null ? null : [tripRow.current_version_id, localDate],
    DAY_ITEMS_TABLES,
  );
  const weather = useLiveRows<{ elevation_m: number | null; hourly: string | null }>(
    WEATHER_SQL,
    tripRow?.destination_id == null ? null : [tripRow.destination_id, localDate],
    ['weather_snapshots'],
  );
  const { send: sendReadiness } = useCommand(setReadinessCommand);
  const { send: sendCheck } = useCommand(checkPackingItemCommand);
  const { send: sendAdd } = useCommand(addPackingItemCommand);
  const { send: sendRemove } = useCommand(removePackingItemCommand);

  const leaveBy = pickLeaveBy(leaveBys.views);
  const guideName = tripRow?.guide_name ?? GUIDE_STICKERS[guideOr(tripRow?.guide_slug)].name;
  const dayNo = items.rows[0]?.day_no ?? null;
  const forecast = forecastFor(weather.rows, leaveBy?.startsAt ?? null);
  const timeline = dayTimeline(items.rows, me, members, locale, tz);
  const port = alarmPort();
  const note = alarmNoteFor(leaveBy, alarm.status, port?.authorizationStatus() ?? null, locale);

  const onSheetPrimary = async () => {
    const kind = sheet;
    setSheet(null);
    if (kind === 'ask') {
      if (port !== null) await port.requestAuthorization().catch(() => null);
      else await requestWithPrimer('notifications', 'first_leave_by').catch(() => null);
    } else if (kind === 'exact') {
      await port?.openExactAlarmSettings().catch(() => false);
    } else if (kind === 'denied') {
      await openPermissionSettings(port === null ? 'notifications' : 'alarms').catch(() => false);
    }
    alarmStore.resync();
  };

  return (
    <DayOfView
      // Each day of the trip shows the next of the destination's photos.
      heroMedia={heroAt(media.items, (dayNo ?? 0) + 1)}
      mediaLowData={mediaLowData}
      // Ready once the day's own rows are in, so the hero never swaps its words under the reader.
      state={
        trip.loaded &&
        leaveBys.loaded &&
        packing.loaded &&
        (items.loaded || (tripRow !== null && tripRow.current_version_id === null))
          ? 'ready'
          : 'loading'
      }
      eyebrow={dayEyebrow(localDate, dayNo, locale)}
      forecast={forecast === null ? null : forecastLabel(forecast.tempC, forecast.atTheTop, locale)}
      leaveBy={leaveBy}
      now={now}
      guideName={guideName}
      firstUp={timeline[0] ?? null}
      pack={buildPackChips(packing.rows, pending.rows, tripId, localDate)}
      timeline={timeline.map((entry) => ({
        ...entry,
        ...(entry.bookingId === null
          ? {}
          : { onPress: () => router.push('/(tabs)/wallet/bookings') }),
      }))}
      offline={sync.phase === 'offline'}
      alarmNote={
        note === null
          ? null
          : {
              text: note.text,
              ...(note.sheet === null
                ? {}
                : {
                    action: {
                      label: note.actionLabel ?? '',
                      onPress: () => setSheet(note.sheet),
                    },
                  }),
            }
      }
      onImUp={() => {
        if (leaveBy === null) return;
        alarmStore.silence(leaveBy.id);
        void sendReadiness({ leave_by_id: leaveBy.id, state: 'up', source: 'app' });
      }}
      onTogglePack={(id, packed) => void sendCheck({ item_id: id, checked: packed })}
      onAddPack={(label) =>
        void sendAdd({
          item_id: generateUuidV7(),
          trip_id: tripId,
          day: localDate,
          label,
          personal: true,
        })
      }
      onRemovePack={(id) => void sendRemove({ item_id: id })}
      overlay={
        sheet === null ? null : (
          <AlarmPermissionSheet
            kind={sheet}
            guideName={guideName}
            onPrimary={() => void onSheetPrimary()}
            onClose={() => setSheet(null)}
          />
        )
      }
    />
  );
}
