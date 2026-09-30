/**
 * Session watcher for the trip egg: once an egg has hatched (the flight landed, the phone arrived
 * or another device hatched it) and this device hasn't played the ceremony, it opens 3l-1 at the
 * next calm moment: the app in front, the viewer resting on a tab root for a moment, never over a
 * boarding pass, an alarm, SOS, a sheet, a flow in progress or onboarding. It plays once per egg.
 *
 * Arrival: while the trip is under way and the egg is still whole, a position the location engine
 * already has (it never asks for permission here) in the destination's country hatches it with
 * `hatch_egg{trigger:'arrived'}`, once per egg per session.
 */
import { router, usePathname } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { countryOf, getLocationEngine } from '@/lib/location';

import { useInFront } from '../data/app-front';
import { hatchEggCommand } from '../data/commands';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { TRIPS_SQL, TRIPS_TABLES, type TripRow } from '../data/queries';
import { hatchRoute } from '../routes';
import { eggCardFor, hatchSeen, useHatchSeenVersion } from './hatch-model';

/** How long the viewer must rest on a calm screen before the ceremony opens. */
export const CALM_MS = 1500;

/** How often a whole egg re-checks the latest position while the trip is under way. */
const ARRIVAL_CHECK_MS = 60_000;

const CALM_PATHS = [/^\/$/u, /^\/pass$/u, /^\/trips$/u, /^\/trips\/[^/]+$/u];

/** A tab root with nothing over it: the only places the hatch may open by itself. */
export function isCalmPath(pathname: string): boolean {
  return CALM_PATHS.some((pattern) => pattern.test(pathname));
}

const arrivedAsked = new Set<string>();

async function arrivedIn(trip: TripRow): Promise<boolean> {
  if (trip.destination_country === null) return false;
  const fixes = getLocationEngine()?.recentFixes() ?? [];
  const last = fixes[fixes.length - 1];
  if (last === undefined) return false;
  const country = await countryOf(last.lat, last.lng);
  return country !== null && country === trip.destination_country.toUpperCase();
}

export function HatchRuntime({ now = () => new Date() }: { readonly now?: () => Date }) {
  const uid = useOwnerUid();
  const pathname = usePathname();
  const active = useInFront();
  const hatch = useCommand(hatchEggCommand);
  useHatchSeenVersion();
  const { rows } = useLiveRows<TripRow>(TRIPS_SQL, uid === null ? null : [uid], TRIPS_TABLES);
  const egg = eggCardFor(rows, now(), hatchSeen);
  const opened = useRef<string | null>(null);

  const unseenEgg = egg?.kind === 'unseen' ? egg.eggId : null;
  const unseenTrip = egg?.kind === 'unseen' ? egg.tripId : null;
  useEffect(() => {
    if (unseenEgg === null || unseenTrip === null || !active || !isCalmPath(pathname)) {
      return undefined;
    }
    if (opened.current === unseenEgg) return undefined;
    const timer = setTimeout(() => {
      opened.current = unseenEgg;
      router.push(hatchRoute(unseenTrip));
    }, CALM_MS);
    return () => clearTimeout(timer);
  }, [unseenEgg, unseenTrip, active, pathname]);

  const whole = rows.find(
    (t) => t.status === 'in_trip' && t.egg_id !== null && t.egg_hatched_at === null,
  );
  const wholeEgg = whole?.egg_id ?? null;
  const latest = useRef(whole);
  useLayoutEffect(() => {
    latest.current = whole;
  });
  const send = hatch.send;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (wholeEgg === null || !active) return undefined;
    const timer = setInterval(() => setTick((n) => n + 1), ARRIVAL_CHECK_MS);
    return () => clearInterval(timer);
  }, [wholeEgg, active]);
  useEffect(() => {
    const trip = latest.current;
    if (wholeEgg === null || trip === undefined || !active || arrivedAsked.has(wholeEgg)) return;
    void arrivedIn(trip).then((arrived) => {
      if (!arrived || arrivedAsked.has(wholeEgg)) return;
      arrivedAsked.add(wholeEgg);
      void send({ trip_id: trip.id, trigger: 'arrived' });
    });
  }, [wholeEgg, active, send, tick]);

  return null;
}
