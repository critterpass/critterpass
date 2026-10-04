/**
 * The day-of screen's words for each leave-by state (3k-2): the hero label and time, the pickup
 * line, the ring caption, and the readiness line ("4 of 6 are up", "Tokek rings Alex and Dev at
 * 03:00"). Read in the active locale at render.
 */
/* eslint-disable lingui/no-unlocalized-strings -- Intl option values, never copy. */
import { format } from '@cp/i18n';
import { plural, t } from '@lingui/core/macro';

import { clockIn, countdownText, type LeaveByView } from '../leave-by/model';

/** Past ten hours the countdown no longer fits inside the ring. */
const RING_MAX_MS = 10 * 60 * 60 * 1000;

export interface HeroCopy {
  readonly label: string;
  readonly time: string;
  readonly spokenTime: string;
  readonly instructions: string | null;
  readonly ring: {
    readonly value: string;
    readonly caption: string;
    readonly spoken: string;
  } | null;
  readonly readinessLabel: string;
  readonly readinessDetail: string | null;
}

/** "Fri, 10/2 · Day 2" (the weekday and numeric date, as the plan names a day), led by "Tomorrow" when the day shown is the day after the trip's today. */
export function dayEyebrow(
  localDate: string,
  dayNo: number | null,
  locale: string,
  tomorrow = false,
): string {
  const date = new Date(`${localDate}T12:00:00Z`);
  const day = format.date(locale, date, {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
  });
  const line =
    dayNo === null ? day : t({ id: 'trip.dayOf.eyebrow', message: `${day} · Day ${dayNo}` });
  return tomorrow ? t({ id: 'trip.dayOf.tomorrow', message: `Tomorrow · ${line}` }) : line;
}

export function forecastLabel(tempC: number, atTheTop: boolean, locale: string): string {
  const degrees = `${format.number(locale, Math.round(tempC))}°`;
  return atTheTop ? t({ id: 'trip.dayOf.forecastTop', message: `${degrees} at the top` }) : degrees;
}

function names(view: LeaveByView, locale: string): string {
  const you = t({ id: 'trip.dayOf.you', message: 'you' });
  return format.list(
    locale,
    view.sleepers.map((person) => (person.me ? you : person.name)),
    { type: 'conjunction' },
  );
}

export function heroCopy(
  view: LeaveByView,
  now: Date,
  guideName: string,
  locale: string,
): HeroCopy {
  const leave = clockIn(view.deadline.at, view.tz, locale);
  const beThere = view.deadline.kind === 'be_there_by';
  const airport = view.deadline.kind === 'be_there_by' && view.deadline.airport;
  const alarm = clockIn(view.alarmAt, view.tz, locale);
  const pickupTime = view.pickup === null ? null : clockIn(view.pickup.at, view.tz, locale);
  const pickupPlace = view.pickup?.place ?? view.placeName;
  const pickupLine =
    pickupTime === null
      ? null
      : pickupPlace === null
        ? t({ id: 'trip.dayOf.pickupAt', message: `Pickup at ${pickupTime}.` })
        : t({
            id: 'trip.dayOf.pickupAtPlace',
            message: `Pickup at ${pickupPlace}, ${pickupTime}.`,
          });
  // A deadline to be there counts no travel at all, so it says that instead of the traffic note.
  const traffic = beThere
    ? airport
      ? t({
          id: 'trip.dayOf.noTravelAirport',
          message: "Travel time to the airport isn't included.",
        })
      : t({ id: 'trip.dayOf.noTravel', message: "Travel time isn't included." })
    : view.withoutTraffic
      ? t({ id: 'trip.dayOf.noTraffic', message: 'Worked out without live traffic.' })
      : null;
  const instructions = [pickupLine, view.guideNote, traffic].filter(Boolean).join(' ') || null;
  const total = view.crew.length;
  const up = view.upCount;
  const readinessLabel = view.allUp
    ? t({
        id: 'trip.dayOf.allUp',
        message: plural(total, { one: "You're up", other: 'All # are up' }),
      })
    : t({ id: 'trip.dayOf.upCount', message: `${up} of ${total} are up` });
  const who = names(view, locale);
  const sleepers = view.sleepers.length;
  let readinessDetail: string | null;
  if (view.phase === 'transit') {
    readinessDetail = null;
  } else if (view.allUp) {
    readinessDetail = t({
      id: 'trip.dayOf.allUpDetail',
      message: 'Everyone is up. See you out front.',
    });
  } else if (view.phase === 'overdue') {
    readinessDetail = view.knocked
      ? t({ id: 'trip.dayOf.knocked', message: `The crew was pinged to knock for ${who}.` })
      : t({
          id: 'trip.dayOf.stillAsleep',
          message: plural(sleepers, {
            one: `${who} is still asleep.`,
            other: `${who} are still asleep.`,
          }),
        });
  } else if (now.getTime() >= view.alarmAt.getTime()) {
    readinessDetail = t({ id: 'trip.dayOf.ringing', message: `${guideName} is ringing ${who}` });
  } else {
    readinessDetail = t({
      id: 'trip.dayOf.rings',
      message: `${guideName} rings ${who} at ${alarm}`,
    });
  }
  const left = view.deadline.at.getTime() - now.getTime();
  // A leave-by is late once someone is still asleep at it; a deadline to be there, once it passes.
  const late = beThere ? left <= 0 : view.phase === 'overdue';
  if (view.phase === 'transit') {
    return {
      label: t({ id: 'trip.dayOf.onTheWay', message: 'On the way' }),
      time: pickupTime ?? leave,
      spokenTime: pickupTime ?? leave,
      instructions:
        pickupTime === null
          ? view.title
          : t({ id: 'trip.dayOf.pickupEta', message: `Pickup ETA ${pickupTime}` }),
      ring: null,
      readinessLabel,
      readinessDetail,
    };
  }
  const value = countdownText(left);
  // The ring holds a countdown up to "9:59:59"; a deadline further off (another day's) has none.
  const ringed = left < RING_MAX_MS;
  return {
    label: !beThere
      ? t({ id: 'trip.dayOf.leaveBy', message: 'Leave by' })
      : airport
        ? t({ id: 'trip.dayOf.beAtAirportBy', message: 'Be at the airport by' })
        : t({ id: 'trip.dayOf.beThereBy', message: 'Be there by' }),
    time: leave,
    spokenTime: leave,
    instructions,
    ring: !ringed
      ? null
      : {
          value,
          caption: late
            ? t({ id: 'trip.dayOf.ringLate', message: 'late' })
            : t({ id: 'trip.dayOf.ringToGo', message: 'to go' }),
          spoken: late
            ? beThere
              ? t({
                  id: 'trip.dayOf.ringBeThereLateSpoken',
                  message: 'The time to be there has passed',
                })
              : t({ id: 'trip.dayOf.ringLateSpoken', message: 'Leave-by time has passed' })
            : t({ id: 'trip.dayOf.ringSpoken', message: `${value} to go` }),
        },
    readinessLabel,
    readinessDetail,
  };
}
