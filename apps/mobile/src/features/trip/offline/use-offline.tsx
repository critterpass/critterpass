/**
 * The offline state for one trip, live: sync phase (no signal, weak signal, back), the saved day
 * bundle for today, today's plan, the upload queue through the reconnect, and what was rejected.
 * Answers null while online with nothing to show; "Back online" stays a moment after the last
 * tick, then lifts.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { toLocalWallTime } from '@cp/domain';
import { msg, plural, t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useEffect, useReducer, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useQueuedCommands } from '@/data/status/use-queued-commands';
import { dismissRejected, useRejectedCommands } from '@/data/status/use-rejected-commands';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion';
import { impact } from '@/motion/feedback';

import { BUNDLE_KIND, savedDayId, type SavedDay } from '../bundle/bundle-manager';
import {
  DAY_ITEMS_SQL,
  DAY_ITEMS_TABLES,
  TRIP_SQL,
  TRIP_TABLES,
  type DayItemRow,
  type TripRow,
} from '../hub/data/queries';
import { useLiveRows, useOwnerUid } from '../hub/data/live-rows';
import { guideOr } from '../hub/guide';
import { tripDayRoute } from '../hub/routes';
import { clockIn } from '../leave-by/model';
import { dayEyebrow } from '../day-of/day-of-copy';
import { stillWorksLines } from './offline-copy';
import type { OfflineViewProps } from './offline-view';
import { cancelQueued, editQueuedMessage, queuedMessageBody, SEND_MESSAGE } from './queue-actions';
import { QueuedItemSheet } from './queued-item-sheet';
import { INITIAL_RECONNECT, stepReconnect } from './reconnect-sequence';

/** "Back online" stays up while the last ticks and SENT flaps land, then the banner lifts. */
const BACK_HOLD_MS = 1400;
const GONE = msg({ id: 'trip.offline.gone', message: 'Already sent' });

export function useOffline(
  tripId: string,
  options: { readonly always?: boolean } = {},
): OfflineViewProps | null {
  const me = useOwnerUid();
  const locale = useLocale();
  const { db } = useLocalFirst();
  const sync = useSyncStatus();
  const queue = useQueuedCommands();
  const { items: rejected } = useRejectedCommands();
  const offline = sync.phase === 'offline';
  const [state, step] = useReducer(
    (current: typeof INITIAL_RECONNECT, input: { offline: boolean; queue: typeof queue }) =>
      stepReconnect(current, input.offline, input.queue),
    INITIAL_RECONNECT,
  );
  useEffect(() => step({ offline, queue }), [offline, queue]);
  const [lifted, setLifted] = useState(true);
  // Going offline drops the banner in at once (adjusted during render, not in an effect).
  if (state.phase === 'offline' && lifted) setLifted(false);
  useEffect(() => {
    if (state.phase === 'offline') {
      impact('thud.soft');
      return undefined;
    }
    if (state.phase !== 'back') return undefined;
    impact('pop');
    const sent = state.items.length;
    if (sent > 0) {
      toast.show({
        id: 'trip-offline-back',
        title: t({
          id: 'trip.offline.backToast',
          message: plural(sent, {
            one: 'Back online. # thing sent.',
            other: 'Back online. # things sent.',
          }),
        }),
      });
    }
    const timer = setTimeout(() => setLifted(true), BACK_HOLD_MS);
    return () => clearTimeout(timer);
  }, [state.phase, state.items.length]);
  const [open, setOpen] = useState<{ opId: string; body: string | null; since: Date } | null>(null);

  const trip =
    useLiveRows<TripRow>(TRIP_SQL, me === null ? null : [me, tripId], TRIP_TABLES).rows[0] ?? null;
  const tz = trip?.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  const today = toLocalWallTime(now, tz).date;
  const items = useLiveRows<DayItemRow>(
    DAY_ITEMS_SQL,
    trip?.current_version_id == null ? null : [trip.current_version_id, today],
    DAY_ITEMS_TABLES,
  ).rows;
  const saved = useLiveRows<{ data: string }>(
    'SELECT data FROM local_private WHERE kind = ? AND id = ?',
    [BUNDLE_KIND, savedDayId(tripId, today)],
    ['local_private'],
  ).rows[0];
  const day = saved === undefined ? null : (JSON.parse(saved.data) as SavedDay);

  const quiet =
    lifted &&
    state.phase !== 'offline' &&
    state.phase !== 'reconnecting' &&
    sync.phase !== 'connecting';
  if (quiet && options.always !== true) return null;
  const started = items.filter(
    (item) => item.starts_at !== null && Date.parse(item.starts_at) <= now.getTime(),
  );
  const here = started[started.length - 1] ?? items[0];
  const place = here?.poi_name ?? trip?.destination_name ?? null;
  const time = clockIn(now, tz, locale);
  const savedAt = day === null ? null : clockIn(new Date(day.savedAt), tz, locale);
  const headline = quiet
    ? t({ id: 'trip.offline.readyHeadline', message: 'Ready for no signal' })
    : place === null
      ? t({ id: 'trip.offline.headline', message: 'Offline' })
      : t({ id: 'trip.offline.headlineAt', message: `Offline at ${place}` });
  const line =
    savedAt === null
      ? t({
          id: 'trip.offline.notSaved',
          message:
            "Today isn't saved to this phone yet. The plan still works; tickets and maps need signal.",
        })
      : day !== null && day.missing.length > 0
        ? t({
            id: 'trip.offline.partSaved',
            message: `${time}. Part of today was saved to your phone at ${savedAt}.`,
          })
        : t({
            id: 'trip.offline.saved',
            message: `${time}. Today was saved to your phone at ${savedAt}.`,
          });
  const first = items.find((item) => item.starts_at !== null);
  const lastSynced = sync.lastSyncedAt === null ? null : clockIn(sync.lastSyncedAt, tz, locale);
  return {
    card: {
      eyebrow: dayEyebrow(today, first?.day_no ?? null, locale),
      headline,
      line,
      chip: quiet
        ? 'online'
        : state.phase === 'back'
          ? 'back'
          : sync.phase === 'connecting' && !offline
            ? 'weak'
            : 'offline',
      guide: guideOr(trip?.guide_slug),
    },
    stillWorks: stillWorksLines({ day, first, tz, locale }),
    sends: state.items.map((item) => ({
      opId: item.opId,
      summary: item.summary,
      sent: item.sent,
      tickIndex: item.tickIndex,
    })),
    conflicts: rejected,
    lastSynced,
    onOpenPlan: () => router.push(tripDayRoute(tripId, today)),
    onOpenSend: (opId) => {
      const op = queue.find((item) => item.opId === opId);
      const since = new Date(op?.createdAt ?? Date.now());
      void (op?.cmd === SEND_MESSAGE ? queuedMessageBody(db, opId) : Promise.resolve(null)).then(
        (body) => setOpen({ opId, body, since }),
      );
    },
    onDismissConflict: (opId) => void dismissRejected(db, opId),
    sheet:
      open === null ? null : (
        <QueuedItemSheet
          summary={queue.find((op) => op.opId === open.opId)?.summary ?? GONE}
          since={clockIn(open.since, tz, locale)}
          body={open.body}
          onCancel={() => cancelQueued(db, open.opId)}
          onEdit={(body) => editQueuedMessage(db, open.opId, body)}
          onClose={() => setOpen(null)}
        />
      ),
  };
}
