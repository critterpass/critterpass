/**
 * "I'm here" and "Done" on a stop of today. Saying it records a visit to the stop's place the way
 * a manual check-in does (`record_visit`, source `manual`: the place and two instants, never where
 * the phone is), queued like any command so it works with no signal. Visits do not sync back to the
 * phone, so what this phone said is kept here, per trip and stop, for the buttons to read.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names and storage keys, never copy. */
import { generateUuidV7, toLocalWallTime, type RecordVisitPayload } from '@cp/domain';
import { msg } from '@lingui/core/macro';
import { useCallback, useMemo } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import {
  checkInState,
  nextCheckIn,
  parseCheckIn,
  useCheckIns,
  useCheckInValue,
} from '@/data/plan/said-stops';

import { clock } from './format';

export {
  checkInState,
  nextCheckIn,
  parseCheckIn,
  useCheckIns,
  useSaidStops,
  type CheckIn,
  type CheckInState,
} from '@/data/plan/said-stops';

export const checkInCommand = defineClientCommand<RecordVisitPayload>({
  name: 'record_visit',
  offline: true,
  summarize: (payload) =>
    payload.left_at === undefined
      ? msg({ id: 'plan.day.stop.queued.here', message: "You're here" })
      : msg({ id: 'plan.day.stop.queued.done', message: 'Done at a stop' }),
});

export function useStopCheckIn(tripId: string, stableId: string, poiId: string | null) {
  const [raw, setRaw] = useCheckInValue(tripId, stableId);
  const { send } = useCommand(checkInCommand);
  const checkIn = parseCheckIn(raw);
  const state = checkInState(checkIn);
  /** "I'm here", then "Done"; nothing once the stop is done. */
  const advance = useCallback(() => {
    const current = parseCheckIn(raw);
    if (current?.leftAt != null) return;
    const next = nextCheckIn(current, new Date(), generateUuidV7);
    setRaw(JSON.stringify(next));
    // A stop with no place has nothing to visit: it is kept on this phone only.
    if (poiId === null) return;
    void send({
      visit_id: next.visitId,
      trip_id: tripId,
      poi_id: poiId,
      source: 'manual',
      arrived_at: next.arrivedAt,
      ...(next.leftAt === null ? {} : { left_at: next.leftAt }),
    });
  }, [raw, setRaw, send, tripId, poiId]);
  return { checkIn, state, advance };
}

/** The stops she said she is at, with the clock she arrived on the trip's time ("13:01"). */
export function useHereSince(
  tripId: string | null,
  tz: string,
  locale: string,
): ReadonlyMap<string, string> {
  const checkIns = useCheckIns(tripId);
  return useMemo(() => {
    const here = new Map<string, string>();
    for (const [id, checkIn] of checkIns) {
      if (checkIn.leftAt !== null) continue;
      const [hours = 0, minutes = 0] = toLocalWallTime(new Date(checkIn.arrivedAt), tz)
        .time.split(':')
        .map(Number);
      here.set(id, clock(locale, hours * 60 + minutes));
    }
    return here;
  }, [checkIns, tz, locale]);
}
