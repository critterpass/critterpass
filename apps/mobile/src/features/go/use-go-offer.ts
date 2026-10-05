/**
 * Whether GO can be offered for a target, before the button is shown: the place it would open on,
 * read the same way the GO screen reads it, so a button never leads to a GO with nowhere to go.
 * An airport comes with the words the button adds ("Đà Nẵng airport (DAD)").
 */
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';

import { bundledAirportAt } from './data/airport';
import { loadGoPlace, type AirportLookup, type GoPlace, type GoTarget } from './data/go-place';
import { useRemoteGoPlace } from './data/remote-go-place';

export interface GoOffer {
  /** False while the place loads and when there is none. */
  readonly placed: boolean;
  /** What the button names after GO, for an airport; null for a stop (its name is beside it). */
  readonly detail: string | null;
}

/** "Đà Nẵng airport (DAD)": what the GO button adds for an airport. */
export function goAirportLabel(city: string, iata: string): string {
  return t({ id: 'go.button.airport', message: `${city} airport (${iata})` });
}

export function useGoOffer(
  target: GoTarget | null,
  airportAt: AirportLookup = bundledAirportAt,
): GoOffer {
  const { db } = useLocalFirst();
  const remote = useRemoteGoPlace();
  // Re-renders with the language, so the label below follows it.
  useLocale();
  const key = target === null ? null : JSON.stringify(target);
  const [loaded, setLoaded] = useState<{ key: string; place: GoPlace | null } | null>(null);
  useEffect(() => {
    if (target === null || key === null) return undefined;
    let live = true;
    void loadGoPlace(db, target, new Date(), airportAt, remote)
      .catch(() => null)
      .then((place) => {
        if (live) setLoaded({ key, place });
      });
    return () => {
      live = false;
    };
    // `target` is folded into `key`; the airport list is fixed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, remote, key]);
  const place = key !== null && loaded?.key === key ? loaded.place : null;
  if (place === null) return { placed: false, detail: null };
  if (place.airport === undefined) return { placed: true, detail: null };
  const { city, iata } = place.airport;
  return { placed: true, detail: goAirportLabel(city, iata) };
}
