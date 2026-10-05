/**
 * What add from a link does with the places ticked (7d-3): SAVE {n} TO IDEAS saves each to the
 * trip's Ideas with only the link kept (`source: link`, `source_url`), and "Or put them on Sat 17"
 * adds them on that day at the slots the fit engine finds (an organiser's edit applies, a member's
 * is proposed); a place the day has no room for is saved to Ideas instead of being dropped.
 * Either way the link is remembered on this phone so it is not offered again.
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
import { splitBySlot } from './link-import-model';
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

export type PutOnDayResult =
  | { readonly kind: 'failed' }
  | {
      readonly kind: 'done';
      /** How the day's edit went; `none` when no place had a slot on the day. */
      readonly outcome: 'applied' | 'proposed' | 'none';
      readonly placed: readonly ImportCandidate[];
      /** Places the day had no room for, saved to Ideas instead. */
      readonly ideas: readonly ImportCandidate[];
    };

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

  const sendToIdeas = async (places: readonly ImportCandidate[]): Promise<ImportCandidate[]> => {
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
    return places.filter((_, index) => {
      const kind = results[index]?.kind;
      return kind === 'queued' || kind === 'applied';
    });
  };

  /** The places that were saved (a refused or unsent save is left out). */
  const saveToIdeas = async (places: readonly ImportCandidate[]): Promise<ImportCandidate[]> => {
    setBusy(true);
    try {
      const saved = await sendToIdeas(places);
      if (sourceUrl !== null && saved.length > 0) markImported(sourceUrl);
      return saved;
    } finally {
      setBusy(false);
    }
  };

  /**
   * Places with a slot on the day go on it; the ones the day has no room for are saved to Ideas
   * instead, and the answer names both. `failed` when the slots could not be read or the edit
   * did not go through: nothing was changed.
   */
  const putOnDay = async (
    places: readonly ImportCandidate[],
    dayNo: number,
  ): Promise<PutOnDayResult> => {
    const day = plan.dayRows.find((row) => row.day_no === dayNo);
    const tz = plan.trip?.tz ?? null;
    if (day === undefined || day.date === null || tz === null) return { kind: 'failed' };
    setBusy(true);
    try {
      const read = await services.postJson(`/v1/trips/${tripId}/fit`, {
        poi_ids: places.map((place) => place.poi_id),
        day_id: day.id,
      });
      if (read.kind !== 'ok') return { kind: 'failed' };
      const { slotted, unslotted } = splitBySlot(places, fitsOf(read.body), day.id);
      let outcome: EditOutcome['kind'] | 'none' = 'none';
      if (slotted.length > 0) {
        const edit = await editor.submit(
          slotted.map(({ place, startsAt, endsAt }) =>
            addOp(
              { date: day.date ?? '', dayNo },
              {
                title: null,
                poiId: place.poi_id,
                category: place.category,
                start: minutesOf(startsAt, tz),
                end: minutesOf(endsAt, tz),
                tz,
              },
            ),
          ),
        );
        if (edit.kind === 'unavailable') return { kind: 'failed' };
        outcome = edit.kind;
      }
      const ideas = await sendToIdeas(unslotted);
      if (outcome === 'none' && ideas.length === 0) return { kind: 'failed' };
      if (sourceUrl !== null) markImported(sourceUrl);
      return { kind: 'done', outcome, placed: slotted.map((slot) => slot.place), ideas };
    } finally {
      setBusy(false);
    }
  };

  return { busy, saveToIdeas, putOnDay, organiser: plan.canApply, days: plan.dayRows };
}
