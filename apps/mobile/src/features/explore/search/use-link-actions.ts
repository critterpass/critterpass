/**
 * What add from a link does with the places ticked (7d-3): SAVE {n} TO IDEAS saves each to the
 * trip's Ideas with only the link kept (`source: link`, `source_url`), and "Or put them on Sat 17"
 * adds them on that day at the slots the fit engine finds (an organiser's edit applies, a member's
 * is proposed). Either way the link is remembered on this phone so it is not offered again.
 */
/* eslint-disable lingui/no-unlocalized-strings -- api paths and wire values, never copy. */
import {
  generateUuidV7,
  placeFitSchema,
  toLocalWallTime,
  type ImportCandidate,
  type PlaceFit,
} from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { addOp } from '@/data/plan/plan-ops';
import { usePlanEditor, type EditOutcome } from '@/data/plan/use-plan-editor';
import { useTripPlan } from '@/data/plan/use-trip-plan';

import { markImported } from './clipboard';
import { saveIdeaCommand } from './commands';
import { useSearchServices } from './data/search-services';

/** The fit route's places, each read on its own; a malformed one is left out. */
function fitsOf(body: unknown): PlaceFit[] {
  const fits = (body as { fits?: unknown } | null)?.fits;
  if (!Array.isArray(fits)) return [];
  return fits.flatMap((raw: unknown) => {
    const parsed = placeFitSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
}

function minutesOf(iso: string, tz: string): number {
  const [hours = 0, minutes = 0] = toLocalWallTime(new Date(iso), tz).time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function useLinkActions(tripId: string, sourceUrl: string | null) {
  const { t } = useLingui();
  const services = useSearchServices();
  const save = useCommand(saveIdeaCommand);
  const plan = useTripPlan(tripId);
  const editor = usePlanEditor(
    plan,
    {
      moved: t({ id: 'search.link.reason.moved', message: 'New time' }),
      added: t({ id: 'search.link.reason.added', message: 'From a link' }),
      removed: t({ id: 'search.link.reason.removed', message: 'Taken off the day' }),
    },
    { onConflict: () => undefined, onLocked: () => undefined },
  );
  const [busy, setBusy] = useState(false);

  const saveToIdeas = async (places: readonly ImportCandidate[]): Promise<number> => {
    setBusy(true);
    try {
      const results = await Promise.all(
        places.map((place) =>
          save.send({
            idea_id: generateUuidV7(),
            trip_id: tripId,
            poi_id: place.poi_id,
            source: 'link',
            ...(sourceUrl === null ? {} : { source_url: sourceUrl }),
          }),
        ),
      );
      if (sourceUrl !== null) markImported(sourceUrl);
      return results.filter((result) => result.kind !== 'rejected').length;
    } finally {
      setBusy(false);
    }
  };

  const putOnDay = async (
    places: readonly ImportCandidate[],
    dayNo: number,
  ): Promise<EditOutcome> => {
    const day = plan.dayRows.find((row) => row.day_no === dayNo);
    const tz = plan.trip?.tz ?? null;
    if (day === undefined || day.date === null || tz === null) return { kind: 'unavailable' };
    setBusy(true);
    try {
      const read = await services.postJson(`/v1/trips/${tripId}/fit`, {
        poi_ids: places.map((place) => place.poi_id),
        day_id: day.id,
      });
      const fits = read.kind === 'ok' ? fitsOf(read.body) : [];
      if (fits.length === 0) return { kind: 'unavailable' };
      const ops = places.flatMap((place) => {
        const slot = fits
          .find((fit) => fit.poi_id === place.poi_id)
          ?.days.find((entry) => entry.day_id === day.id)?.slot;
        if (slot === null || slot === undefined) return [];
        return [
          addOp(
            { date: day.date ?? '', dayNo },
            {
              title: null,
              poiId: place.poi_id,
              category: place.category,
              start: minutesOf(slot.starts_at, tz),
              end: minutesOf(slot.ends_at, tz),
              tz,
            },
          ),
        ];
      });
      if (ops.length === 0) return { kind: 'unavailable' };
      const outcome = await editor.submit(ops);
      if (outcome.kind !== 'unavailable' && sourceUrl !== null) markImported(sourceUrl);
      return outcome;
    } finally {
      setBusy(false);
    }
  };

  return { busy, saveToIdeas, putOnDay, organiser: plan.canApply, days: plan.dayRows };
}
