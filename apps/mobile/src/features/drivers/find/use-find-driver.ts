/**
 * Find a driver's state for either UI: the plan's days (pre-picked from the day's card; more can
 * be added), the trip's one shortlist across every source, and where each source opens.
 */
import { router } from 'expo-router';
import { useState } from 'react';

import { goBackOr } from '@/lib/navigation/back';

import { driverRoutes, driversRoute, splitDays, tripRoute } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';
import { useDrivers } from '../shared/use-drivers';

export type FindDriver = ReturnType<typeof useFindDriver>;

export function useFindDriver(tripId: string, initial: string | undefined) {
  const plan = useDriverDays(tripId);
  const { state, refresh } = useDrivers(tripId);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(splitDays(initial)));
  const [adding, setAdding] = useState(false);
  const chosen = plan.days.filter((day) => picked.has(day.date));
  const first = chosen[0] ?? plan.days.find((day) => day.gap !== null) ?? null;
  const daysParam = { days: [...picked].sort().join(',') };
  const shortlist =
    state.kind === 'ready' || state.kind === 'offline'
      ? (state.data?.drivers ?? []).filter((driver) => driver.terms.status === 'shortlisted')
      : [];
  const toggle = (date: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  return {
    plan,
    state,
    refresh,
    picked,
    toggle,
    adding,
    startAdding: () => setAdding(true),
    first,
    shown: adding ? plan.days : chosen,
    // "+ Day" only while a day is left to add; with no days at all the row says why.
    canAdd: !adding && plan.days.length > chosen.length,
    shortlist,
    shortlistFailed: state.kind === 'error' || (state.kind === 'offline' && state.data === null),
    onBack: () => goBackOr(tripRoute(tripId)),
    onTours: () => router.push(driversRoute(tripId, 'tours', daysParam)),
    onFound: () => router.push(driversRoute(tripId, 'add', daysParam)),
    onAsk: () => router.push(driversRoute(tripId, 'ask', daysParam)),
    onDirectory: () =>
      router.push(driverRoutes.directory(tripId, plan.area === '' ? undefined : plan.area)),
    onOurs: () => router.push(driverRoutes.ours(tripId)),
    onCompare: () => router.push(driversRoute(tripId, 'compare', daysParam)),
  };
}
