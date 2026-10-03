/**
 * The crew live map's words: member status lines from the deterministic status key, clock times
 * in the trip's zone, distances, and the spoken labels for pins and rows.
 */
import type { MemberEtaWire } from '@cp/domain';
import { t } from '@lingui/core/macro';

import type { PersonView } from './data/view-model';
import { clockOption } from '@/lib/i18n/formats';
import { distanceIn } from '@/lib/i18n/formats';

/** "16:52" in the trip's zone (24-hour, as the map shows every clock). */
export function clock(at: number, tz: string | null, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- Intl options, never copy.
    hour: '2-digit',
    ...clockOption(),
    // eslint-disable-next-line lingui/no-unlocalized-strings -- Intl options, never copy.
    minute: '2-digit',
    hourCycle: 'h23',
    ...(tz === null ? {} : { timeZone: tz }),
  }).format(new Date(at));
}

/**
 * "900 m", "2 km", "2.4 km". Written with the number formatter and the unit in the copy: Intl's
 * unit style converts to the locale's preferred units on some platforms (miles on en-US iOS).
 */
export function distanceText(meters: number, locale: string): string {
  const away = distanceIn(meters);
  if (away.unit === 'mi') {
    const mi = new Intl.NumberFormat(locale, {
      maximumFractionDigits: away.value < 10 ? 1 : 0,
    }).format(Math.max(0.1, away.value));
    return t({ id: 'liveMap.distance.miles', message: `${mi} mi` });
  }
  if (meters < 1000) {
    const rounded = new Intl.NumberFormat(locale).format(
      Math.max(10, Math.round(meters / 10) * 10),
    );
    return t({ id: 'liveMap.distance.meters', message: `${rounded} m` });
  }
  const km = new Intl.NumberFormat(locale, {
    maximumFractionDigits: meters < 10_000 ? 1 : 0,
  }).format(meters / 1000);
  return t({ id: 'liveMap.distance.kilometers', message: `${km} km` });
}

function withDistance(line: string, eta: MemberEtaWire, locale: string, out: boolean): string {
  const meters = eta.status.distance_m;
  if (meters === null) return line;
  const distance = distanceText(meters, locale);
  return out
    ? t({ id: 'liveMap.status.withDistanceOut', message: `${line}, ${distance} out` })
    : t({ id: 'liveMap.status.withDistance', message: `${line}, ${distance}` });
}

/** The line under a name: "Leaving Karsa Spa", "On the scooter, 2 km out", "Here". */
export function statusLine(
  person: PersonView,
  tz: string | null,
  locale: string,
  now: number,
): string {
  if (person.sharing === 'paused') {
    const at = person.pausedAt === null ? '' : clock(person.pausedAt, tz, locale);
    return t({ id: 'liveMap.status.paused', message: `Paused sharing at ${at}` });
  }
  if (person.sharing === 'off') {
    return t({ id: 'liveMap.status.off', message: 'Not sharing' });
  }
  if (person.position === null) {
    return t({ id: 'liveMap.status.waiting', message: 'Waiting for a location' });
  }
  if (person.stale) {
    const minutes = Math.max(1, Math.round((now - person.position.at) / 60_000));
    return t({ id: 'liveMap.status.lastSeen', message: `Last seen ${minutes} min ago` });
  }
  const eta = person.eta;
  if (eta === null) {
    return person.position.activity === 'automotive'
      ? t({ id: 'liveMap.status.onTheRoad', message: 'On the road' })
      : t({ id: 'liveMap.status.sharing', message: 'Sharing live' });
  }
  const poi = eta.status.poi ?? '';
  switch (eta.status.key) {
    case 'arrived':
      return t({ id: 'liveMap.status.arrived', message: 'Here' });
    case 'at_place':
      return withDistance(
        t({ id: 'liveMap.status.atPlace', message: `At ${poi}` }),
        eta,
        locale,
        false,
      );
    case 'leaving_place':
      return t({ id: 'liveMap.status.leaving', message: `Leaving ${poi}` });
    case 'walking':
      return withDistance(
        t({ id: 'liveMap.status.walking', message: 'Walking' }),
        eta,
        locale,
        true,
      );
    case 'on_scooter':
      return withDistance(
        t({ id: 'liveMap.status.onScooter', message: 'On the scooter' }),
        eta,
        locale,
        true,
      );
    case 'cycling':
      return withDistance(
        t({ id: 'liveMap.status.cycling', message: 'Cycling' }),
        eta,
        locale,
        true,
      );
    case 'driving':
      return withDistance(
        t({ id: 'liveMap.status.driving', message: 'In a car' }),
        eta,
        locale,
        true,
      );
    case 'still':
    case 'unknown':
      return withDistance(
        t({ id: 'liveMap.status.still', message: 'Not moving' }),
        eta,
        locale,
        false,
      );
  }
}

/** "Maya", "Maya and Rin", "Maya, Rin and Alex". */
export function namesList(names: readonly string[], locale: string): string {
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names);
}

/** "3 minutes away", "about 12 minutes away", "here", "no ETA". */
export function etaSpoken(eta: MemberEtaWire | null): string {
  if (eta === null || eta.min === null) return t({ id: 'liveMap.a11y.noEta', message: 'no ETA' });
  if (eta.arrived) return t({ id: 'liveMap.a11y.here', message: 'here' });
  const minutes = eta.min;
  return eta.estimate
    ? t({ id: 'liveMap.a11y.aboutMinutesAway', message: `about ${minutes} minutes away` })
    : t({ id: 'liveMap.a11y.minutesAway', message: `${minutes} minutes away` });
}

/** "Maya and Rin, Karsa Spa, 3 minutes away". */
export function pinLabel(people: readonly PersonView[], locale: string): string {
  const names = namesList(
    people.map((person) => person.name),
    locale,
  );
  const lead = people[0];
  const place = lead?.eta?.status.poi ?? null;
  const eta = etaSpoken(lead?.eta ?? null);
  return place === null
    ? t({ id: 'liveMap.a11y.pin', message: `${names}, ${eta}` })
    : t({ id: 'liveMap.a11y.pinAtPlace', message: `${names}, ${place}, ${eta}` });
}
