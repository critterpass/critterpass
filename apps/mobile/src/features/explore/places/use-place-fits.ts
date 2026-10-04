/**
 * The fit line for each place on the map's cards and the list's rows ("Fits Sat at 08:00"): an
 * idea's own synced fit when it answers the plan's current version, else the fit route's answer,
 * else Tokek's ranked fit from the suggestions. Worded on the phone in the app's language.
 */
import type { PlaceFit } from '@cp/domain';
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useMemo } from 'react';

import { useFit, FIT_BATCH } from '@/data/fit/use-fit';
import { fitLine, type FitLine } from '@/data/fit/fit-line';
import type { TripIdeaView } from '@/data/ideas/use-trip-ideas';
import type { TripPlan } from '@/data/plan/use-trip-plan';

/** Each day's short weekday ("Sat") by day number, read on the trip's dates. */
export function weekdaysOf(
  days: readonly { readonly day_no: number; readonly date: string | null }[],
  locale: string,
): Map<number, string> {
  const names = new Map<number, string>();
  for (const day of days) {
    if (day.date === null) continue;
    // eslint-disable-next-line lingui/no-unlocalized-strings -- an ISO time, never copy.
    const noon = new Date(`${day.date}T12:00:00Z`);
    names.set(day.day_no, format.date(locale, noon, { weekday: 'short', timeZone: 'UTC' }));
  }
  return names;
}

export interface PlaceFitsInput {
  readonly tripId: string | null;
  readonly plan: TripPlan;
  readonly tz: string | null;
  /** The places to ask the fit route for (the cards on show); at most one batch is asked. */
  readonly ask: readonly string[];
  readonly ideas: readonly TripIdeaView[];
  /** Fits already worked out (the suggestions), by place id. */
  readonly known?: ReadonlyMap<string, PlaceFit> | undefined;
}

export function usePlaceFits(input: PlaceFitsInput): ReadonlyMap<string, FitLine> {
  const { i18n } = useLingui();
  const { tripId, plan, tz, ask, ideas, known } = input;
  const versionId = plan.versionId;
  const asked = useMemo(() => ask.slice(0, FIT_BATCH), [ask]);
  const live = useFit(tripId, asked, versionId);
  const weekdays = useMemo(
    () => weekdaysOf(plan.dayRows, i18n.locale),
    [plan.dayRows, i18n.locale],
  );
  return useMemo(() => {
    const lines = new Map<string, FitLine>();
    if (tripId === null || tz === null) return lines;
    const context = {
      weekdays,
      tz,
      stopName: (stableId: string) => plan.display.get(stableId)?.title ?? null,
    };
    const stored = new Map<string, PlaceFit>();
    for (const idea of ideas) {
      if (idea.poiId !== null && idea.fit !== null && idea.fit.version_id === versionId) {
        stored.set(idea.poiId, idea.fit);
      }
    }
    const ids = new Set([...stored.keys(), ...live.fits.keys(), ...(known?.keys() ?? [])]);
    for (const id of ids) {
      const fit = stored.get(id) ?? live.fits.get(id) ?? known?.get(id) ?? null;
      const line = fitLine(fit, context);
      if (line !== null) lines.set(id, line);
    }
    return lines;
    // `i18n.locale` re-words the lines when the language changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, tz, weekdays, plan.display, ideas, versionId, live.fits, known, i18n.locale]);
}
