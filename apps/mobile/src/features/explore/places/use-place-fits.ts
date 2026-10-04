/**
 * The fit line for each place on the map's cards and the list's rows ("Fits Sat at 08:00"): an
 * idea's own synced fit when it answers the plan's current version, else the fit route's answer,
 * else Tokek's ranked fit from the suggestions. Worded on the phone in the app's language.
 */
import type { PlaceFit } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useMemo } from 'react';

import { weekdayShort } from './places-copy';
import { useFit, FIT_BATCH } from '@/data/fit/use-fit';
import { fitLine, type FitLine, type FitLineContext } from '@/data/fit/fit-line';
import type { TripIdeaView } from '@/data/ideas/use-trip-ideas';

/**
 * Each day's short weekday ("Sat", "T7") by day number, read on the trip's dates and worded from
 * the app's catalogue; `_locale` is what callers recompute on when the language changes.
 */
export function weekdaysOf(
  days: readonly { readonly dayNo: number; readonly date: string | null }[],
  _locale: string,
): Map<number, string> {
  const names = new Map<number, string>();
  for (const day of days) {
    if (day.date === null) continue;
    // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time, never copy.
    names.set(day.dayNo, weekdayShort(new Date(`${day.date}T12:00:00Z`).getUTCDay()));
  }
  return names;
}

export interface PlaceFitsInput {
  readonly tripId: string | null;
  readonly versionId: string | null;
  readonly days: readonly { readonly dayNo: number; readonly date: string | null }[];
  readonly stopName: (stableId: string) => string | null;
  readonly tz: string | null;
  /** The places to ask the fit route for (the cards on show); at most one batch is asked. */
  readonly ask: readonly string[];
  readonly ideas: readonly TripIdeaView[];
  /** Fits already worked out (the suggestions), by place id. */
  readonly known?: ReadonlyMap<string, PlaceFit> | undefined;
}

/** Fit lines for every place a fit is known for: an idea's current fit, else live, else known. */
export function fitLines(
  fits: readonly (ReadonlyMap<string, PlaceFit> | undefined)[],
  context: FitLineContext,
): Map<string, FitLine> {
  const lines = new Map<string, FitLine>();
  const ids = new Set(fits.flatMap((map) => (map === undefined ? [] : [...map.keys()])));
  for (const id of ids) {
    const fit = fits.map((map) => map?.get(id)).find((entry) => entry !== undefined) ?? null;
    const line = fitLine(fit, context);
    if (line !== null) lines.set(id, line);
  }
  return lines;
}

export function usePlaceFits(input: PlaceFitsInput): ReadonlyMap<string, FitLine> {
  const { i18n } = useLingui();
  const { tripId, versionId, days, stopName, tz, ask, ideas, known } = input;
  const asked = useMemo(() => ask.slice(0, FIT_BATCH), [ask]);
  const live = useFit(tripId, asked, versionId);
  const weekdays = useMemo(() => weekdaysOf(days, i18n.locale), [days, i18n.locale]);
  return useMemo(() => {
    if (tripId === null || tz === null) return new Map<string, FitLine>();
    const stored = new Map<string, PlaceFit>();
    for (const idea of ideas) {
      if (idea.poiId !== null && idea.fit !== null && idea.fit.version_id === versionId) {
        stored.set(idea.poiId, idea.fit);
      }
    }
    return fitLines([stored, live.fits, known], { weekdays, tz, stopName });
    // `i18n.locale` re-words the lines when the language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, tz, weekdays, stopName, ideas, versionId, live.fits, known, i18n.locale]);
}
