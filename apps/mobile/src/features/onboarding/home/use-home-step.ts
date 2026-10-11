/**
 * Page four's working state, shared by the current and the premium page: the search (offline over
 * the bundled airports, the IP hint's nearest on top), a "Did you mean" town when no airport
 * matches (online), "Use my location" (one when-in-use fix, only from that tap), the picked home,
 * and Next, which issues the pass on the device the moment home is set.
 */
import { router } from 'expo-router';
import { useCallback, useContext, useDeferredValue, useEffect, useMemo, useState } from 'react';

import { advanceDraft, type GeoHint } from '@cp/domain';

import { useLocale } from '@/lib/i18n/use-locale';
import { feedback } from '@/motion/feedback';

import { airportDataset } from '../content';
import { ensureDraft, updateDraft, usePassDraft } from '../flow-controller/draft-store';
import { routeForStep } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { OnboardingServicesContext } from '../services';
import { HOME_ROWS, homeResults, readerCountryOf } from './home-search';
import { hintAt, townGuess, townPointFrom, type TownGuess } from './town-guess';

/** Typing rests this long before a town is looked up online. */
const GUESS_DEBOUNCE_MS = 600;

export type LocateStatus = 'idle' | 'locating' | 'denied' | 'no_fix';

export function useHomeStep() {
  useTrackStep('home');
  const locale = useLocale();
  // The geo hint is optional: without services (or offline) the nearest rows simply don't show.
  const services = useContext(OnboardingServicesContext);
  const draft = usePassDraft() ?? ensureDraft();
  const [query, setQuery] = useState('');
  const [hint, setHint] = useState<GeoHint | null>(null);
  const [picked, setPicked] = useState<string | null>(draft.home_iata);

  useEffect(() => {
    let live = true;
    void services
      ?.geoHint()
      .then((next) => {
        if (live) setHint(next);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [services]);

  // The search runs on the deferred query: a keystroke's render stays cheap, and the list catches up.
  const searched = useDeferredValue(query);
  const results = useMemo(
    () => homeResults(airportDataset(), searched, hint, HOME_ROWS, readerCountryOf(locale)),
    [searched, hint, locale],
  );

  const noResults = searched.trim().length > 0 && results.rows.length === 0;
  // With nothing found, the airports near you (the hint's, else the reader's country's) still show.
  const near = useMemo(
    () =>
      noResults
        ? homeResults(airportDataset(), '', hint, HOME_ROWS, readerCountryOf(locale)).rows
        : [],
    [noResults, hint, locale],
  );

  // "Did you mean": the typed town, geocoded online, and its nearest airport.
  const [guess, setGuess] = useState<{ readonly query: string; readonly town: TownGuess } | null>(
    null,
  );
  const lookup = services?.geocodeTown;
  const wanted = noResults && lookup !== undefined ? searched.trim() : '';
  useEffect(() => {
    if (wanted === '' || lookup === undefined) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      void lookup(wanted).then((body) => {
        const point = townPointFrom(body);
        const town = point === null ? null : townGuess(airportDataset().airports, point);
        if (live && town !== null) setGuess({ query: wanted, town });
      });
    }, GUESS_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [wanted, lookup]);

  // "Use my location": one fix from the tap, turned into the hint the nearest rows read.
  const [locate, setLocate] = useState<LocateStatus>('idle');
  const locateOnce = services?.locateOnce;
  const locateMe = useCallback(() => {
    if (locateOnce === undefined || locate === 'locating') return;
    setLocate('locating');
    void locateOnce().then((fix) => {
      if (fix === 'denied' || fix === null) {
        // eslint-disable-next-line lingui/no-unlocalized-strings -- locate states, never copy.
        setLocate(fix === null ? 'no_fix' : 'denied');
        return;
      }
      setHint(hintAt(airportDataset().airports, fix));
      setLocate('idle');
    });
  }, [locateOnce, locate]);

  const pick = (iata: string) => {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a sound cue id.
    feedback.emit('thud.soft');
    setPicked(iata);
  };

  const next = () => {
    if (picked === null) return;
    const moved = updateDraft((d) => {
      const advanced = advanceDraft({ ...d, home_iata: picked }, 'home');
      // The pass is issued the moment home is set: locally first, the server copy follows.
      return advanced.step === 'issued' && advanced.issued_at === null
        ? { ...advanced, issued_at: new Date().toISOString() }
        : advanced;
    });
    if (moved.step !== 'home') router.push(routeForStep(moved.step));
  };

  return {
    query,
    setQuery,
    searched: searched.trim(),
    results,
    noResults,
    near,
    didYouMean: guess !== null && guess.query === wanted ? guess.town : null,
    canLocate: locateOnce !== undefined,
    locate,
    locateMe,
    picked,
    pick,
    next,
  };
}
