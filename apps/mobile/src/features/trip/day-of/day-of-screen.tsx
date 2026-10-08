/**
 * The day-of screen (3k-2) over synced rows: the day's leave-by with who is up, my alarm, the pack
 * list and the timeline. Every tap is a queued command, so the screen works the same with no
 * signal; the in-app alarm permission sheet opens from the alarm line. With the planning screens
 * on, the timeline reads as the day plan does (lengths, travel, what is over and what is next,
 * what is mine alone), each stop opens in the day plan, and a link under the list leads there.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { generateUuidV7, toLocalWallTime } from '@cp/domain';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { goHref, useGoOffer } from '@/features/go';
import { heroAt, useDestinationMedia } from '@/data/media/use-subject-media';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { useOwnerUid } from '../hub/data/live-rows';
import { guideOr } from '../hub/guide';
import { useLiveRows } from '../hub/data/live-rows';
import { dayRoute, LateEntry, saidLateRoute, useDayReading } from '@/features/plan';
import { useLocale } from '@/lib/i18n/use-locale';
import { useNow } from '@/lib/time/use-now';
import { openPermissionSettings, requestWithPrimer } from '@/lib/permissions';
import { guideSticker } from '@/ui/avatar/guides';

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
import { TODAY, tripDayRoute } from '../hub/routes';
import {
  addPackingItemCommand,
  checkPackingItemCommand,
  removePackingItemCommand,
  setReadinessCommand,
} from '../leave-by/commands';
import { useDayLeaveBys } from '../leave-by/use-leave-by';
import { useMediaLowData } from '../media/use-media-low-data';
import {
  alarmNoteFor,
  dayLead,
  dayOfGo,
  dayRelation,
  dayTimeline,
  forecastFor,
  pickLeaveBy,
  withPlanRows,
} from './day-of-data';
import { dayEyebrow, forecastLabel, ringCounting } from './day-of-copy';
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

/** The date after `date` ("2026-10-06" after "2026-10-05"). */
const tomorrowOf = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function DayOfScreen({ tripId, date }: { readonly tripId: string; readonly date: string }) {
  const me = useOwnerUid();
  const locale = useLocale();
  // A minute clock for the day; seconds only while the leave-by ring is counting down. The later
  // of the two is the time, so it never steps back when the seconds stop.
  const [counting, setCounting] = useState(false);
  const minuteNow = useNow(60_000);
  const secondNow = useNow(1000, { enabled: counting });
  const now = secondNow.getTime() > minuteNow.getTime() ? secondNow : minuteNow;
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
  const today = useMemo(() => toLocalWallTime(new Date(minute * 60_000), tz).date, [minute, tz]);
  const localDate = date === TODAY ? today : date;
  const relation = dayRelation(localDate, today);
  // Another day opened while the trip is on (the hub's next stop may be tomorrow's first).
  const tripOnToday =
    tripRow?.start_date != null &&
    today >= tripRow.start_date &&
    today <= (tripRow.end_date ?? tripRow.start_date);
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
  const ringCounts = ringCounting(leaveBy, now);
  if (counting !== ringCounts) setCounting(ringCounts);
  const guideName = tripRow?.guide_name ?? guideSticker(guideOr(tripRow?.guide_slug)).name;
  const dayNo = items.rows[0]?.day_no ?? null;
  const forecast = forecastFor(weather.rows, leaveBy?.startsAt ?? null);
  const planDay = useDayReading(tripId, localDate, now, locale);
  // The guide's notes read in the app's language, with the day plan's reading of the day.
  const base = dayTimeline(items.rows, me, members, locale, tz, planDay.notesOf, planDay.titleOf);
  const timeline = withPlanRows(base, planDay);
  const planDayNo = planDay.dayNo;
  const port = alarmPort();
  const note = alarmNoteFor(leaveBy, alarm.status, port?.authorizationStatus() ?? null, locale);
  const lead = dayLead(timeline, relation === 'today', now);
  // GO is offered only for a place it can open on: the leave-by's first, else the next stop's.
  const goTargets = dayOfGo(leaveBy, lead, tripId, relation === 'today');
  const leaveByOffer = useGoOffer(goTargets.leaveBy);
  const stopOffer = useGoOffer(goTargets.stop);
  const go = leaveByOffer.placed
    ? { target: goTargets.leaveBy, detail: leaveByOffer.detail }
    : stopOffer.placed
      ? { target: goTargets.stop, detail: stopOffer.detail }
      : null;

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
      eyebrow={dayEyebrow(localDate, dayNo, locale, relation === 'tomorrow')}
      onToday={
        relation !== 'today' && tripOnToday
          ? () => router.replace(tripDayRoute(tripId, null))
          : undefined
      }
      forecast={forecast === null ? null : forecastLabel(forecast.tempC, forecast.atTheTop, locale)}
      leaveBy={leaveBy}
      now={now}
      guideName={guideName}
      firstUp={lead}
      onGo={
        go?.target == null
          ? undefined
          : () => {
              if (go.target !== null) router.push(goHref(go.target));
            }
      }
      goDetail={go?.detail ?? null}
      // Late for the stop the hero names, while it is still ahead today.
      late={
        relation !== 'today' ||
        planDayNo === null ||
        lead === null ||
        lead.kind === 'done' ? null : (
          <LateEntry
            onPick={(minutes) => router.push(saidLateRoute(tripId, lead.id, minutes))}
            testID="trip-day-late"
          />
        )
      }
      pack={buildPackChips(packing.rows, pending.rows, tripId, localDate)}
      timeline={timeline.map((entry) => ({
        ...entry,
        ...(entry.bookingId !== null
          ? { onPress: () => router.push('/(tabs)/wallet/bookings') }
          : planDayNo === null
            ? {}
            : { onPress: () => router.push(dayRoute(tripId, planDayNo, entry.id)) }),
      }))}
      onTomorrow={
        relation === 'today' && tripRow?.end_date != null && tomorrowOf(today) <= tripRow.end_date
          ? () => router.push(tripDayRoute(tripId, tomorrowOf(today)))
          : undefined
      }
      onDayPlan={planDayNo === null ? undefined : () => router.push(dayRoute(tripId, planDayNo))}
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
