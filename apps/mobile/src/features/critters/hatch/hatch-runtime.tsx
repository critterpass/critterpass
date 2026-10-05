/**
 * Session watcher for the trip egg: once an egg has hatched (the flight landed, the phone arrived
 * or another device hatched it) and this device hasn't played the ceremony, it opens 3l-1 at the
 * next calm moment: the app in front, the viewer resting on a tab root for a moment, never over a
 * boarding pass, an alarm, SOS, a sheet, a flow in progress or onboarding, and never while a sheet
 * is open on that tab root or the viewer is typing. It plays once per egg. While it waits or plays,
 * nothing else rises by itself (the visit offer waits its turn).
 *
 * Arrival: from the trip's first day, while the egg is still whole, a position the location engine
 * already has (it never asks for permission here) inside the destination's area hatches it with
 * `hatch_egg{trigger:'arrived'}`, once per egg per session. On the first day that also starts the
 * trip, so a morning landing doesn't wait for noon.
 */
import { router, usePathname } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Keyboard, TextInput } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { countryOf } from '@/lib/location';
import { setCeremonyPending } from '@/lib/location/visits/use-rested-on-trip-surface';
import { useTabBarCovered } from '@/ui/sheet/tab-bar-cover';

import { useInFront } from '../data/app-front';
import { hatchEggCommand } from '../data/commands';
import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { TRIPS_SQL, TRIPS_TABLES, type TripRow } from '../data/queries';
import { hatchRoute } from '../routes';
import { awaitsArrival, hasArrived, latestPosition } from './arrival';
import { deviceTimeZone, eggCardFor, hatchSeen, useHatchSeenVersion } from './hatch-model';

/** How long the viewer must rest on a calm screen before the ceremony opens. */
export const CALM_MS = 1500;

/** How often a whole egg re-checks the latest position while the trip is under way. */
const ARRIVAL_CHECK_MS = 60_000;

const CALM_PATHS = [/^\/$/u, /^\/pass$/u, /^\/trips$/u, /^\/trips\/[^/]+$/u];

/** A tab root with nothing over it: the only places the hatch may open by itself. */
export function isCalmPath(pathname: string): boolean {
  return CALM_PATHS.some((pattern) => pattern.test(pathname));
}

/** The viewer is typing: the keyboard is up or a text field has focus. */
const isTyping = () => Keyboard.isVisible() || TextInput.State.currentlyFocusedInput() !== null;

const arrivedAsked = new Set<string>();

async function arrivedIn(trip: TripRow): Promise<boolean> {
  const position = latestPosition();
  return position !== null && hasArrived(trip, position, countryOf);
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
  // A sheet open on the screen in front: she is in the middle of something.
  const covered = useTabBarCovered();
  useEffect(() => {
    setCeremonyPending(unseenEgg !== null);
    return () => setCeremonyPending(false);
  }, [unseenEgg]);
  useEffect(() => {
    if (unseenEgg === null || unseenTrip === null || !active || covered || !isCalmPath(pathname)) {
      return undefined;
    }
    if (opened.current === unseenEgg) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    const wait = () => {
      timer = setTimeout(() => {
        if (isTyping()) {
          wait();
          return;
        }
        opened.current = unseenEgg;
        router.push(hatchRoute(unseenTrip));
      }, CALM_MS);
    };
    wait();
    return () => clearTimeout(timer);
  }, [unseenEgg, unseenTrip, active, covered, pathname]);

  const whole = rows.find((t) => awaitsArrival(t, now(), deviceTimeZone()));
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
