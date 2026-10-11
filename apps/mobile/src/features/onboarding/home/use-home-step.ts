/**
 * Page four's working state, shared by the current and the premium page: the search (offline over
 * the bundled airports, the IP hint's nearest on top, no GPS prompt), the picked home, and Next,
 * which issues the pass on the device the moment home is set.
 */
import { router } from 'expo-router';
import { useContext, useDeferredValue, useEffect, useMemo, useState } from 'react';

import { advanceDraft, type GeoHint } from '@cp/domain';

import { useLocale } from '@/lib/i18n/use-locale';
import { feedback } from '@/motion/feedback';

import { airportDataset } from '../content';
import { ensureDraft, updateDraft, usePassDraft } from '../flow-controller/draft-store';
import { routeForStep } from '../flow-controller/steps';
import { useTrackStep } from '../flow-controller/track';
import { OnboardingServicesContext } from '../services';
import { HOME_ROWS, homeResults, readerCountryOf } from './home-search';

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
    noResults: searched.trim().length > 0 && results.rows.length === 0,
    picked,
    pick,
    next,
  };
}
