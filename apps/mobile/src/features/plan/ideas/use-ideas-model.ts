/**
 * Ideas' state and actions, shared by both looks (7f-2, 4.40): the saved places not removed here,
 * which are already a stop (and on which day), which can still be placed, each one's fit line,
 * and what the taps do: open a place (or its split page), open Add to plan on a day, remove one
 * (mine or for everyone) with Undo, and have the guide place them (7h-6).
 */
import { generateUuidV7 } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { fitLine, type FitLine } from '@/data/fit/fit-line';
import { usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { usePlaceNamer } from '@/data/places/use-shown-names';
import { weekdayOf } from '@/features/plan/day/format';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor, useScreenHref } from '@/lib/navigation/screen-registry';
import { toast } from '@/motion/island-toast';

import { stopOfPlace } from '../add/placed-stop';
import { addRoute } from '../add/routes';
import { dayName } from '../day/format';
import { usePlanGuide } from '../plan-guide';
import { removeIdeaCommand, saveIdeaCommand, startIdeaPlacementOnline } from './commands';
import {
  fitsNeedPlan,
  inPlanFitLine,
  placeFailedToast,
  removedToast,
  undoLabel,
} from './ideas-copy';
import { ideasSummary } from './ideas-model';
import { placingRoute } from './routes';
import { useIdeasPlan } from './use-ideas-plan';

/* eslint-disable lingui/no-unlocalized-strings -- design ids, route params and a toast id below, never copy. */
const MAP_ID = '7c-1';
const PLACE_IDS = ['7e-1'] as const;
const SPLIT_IDS = ['7e-3', '7e-1'] as const;
const SEARCH_ID = '7d-1';
const IDEAS_FILTER = { filter: 'ideas' } as const;
const removedToastId = (ideaId: string) => `plan-idea-removed-${ideaId}`;
/* eslint-enable lingui/no-unlocalized-strings */

export function useIdeasModel(tripId: string) {
  const locale = useLocale();
  const saved = useIdeasPlan(tripId);
  const { plan, days, beforePlan } = saved;
  const guideName = usePlanGuide().name;
  const namer = usePlaceNamer(plan.trip?.destination_id);
  const start = useCommand(startIdeaPlacementOnline);
  const remove = useCommand(removeIdeaCommand);
  const save = useCommand(saveIdeaCommand);
  const [starting, setStarting] = useState(false);
  // Ideas just removed here: gone from the list at once, before the server's own rows sync.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const ideas = useMemo(
    () => saved.ideas.filter((idea) => !gone.has(idea.id)),
    [saved.ideas, gone],
  );
  type Idea = (typeof ideas)[number];
  const mapHref = useScreenHref(MAP_ID, { tripId, ...IDEAS_FILTER });
  const searchHref = useScreenHref(SEARCH_ID, { tripId, scope: 'trip' });
  const tz = plan.trip?.tz ?? 'UTC';
  const openAdd = useCallback(
    (placeId: string, day?: number) =>
      router.push(addRoute(tripId, placeId, { day, source: 'ideas' })),
    [tripId],
  );
  const weekdays = new Map(days.map((day) => [day.dayNo, weekdayOf(day.date, locale)]));
  const names = new Map(plan.members.map((member) => [member.uid, member]));
  const stopName = (stableId: string) => plan.display.get(stableId)?.title ?? null;
  // A saved place that is already a stop (the catalogue sometimes holds one place twice).
  const stopDay = (idea: Idea): string | null => {
    const row = stopOfPlace(idea, plan.itemRows, stopName);
    const date = days.find((day) => day.dayNo === row?.day_no)?.date;
    return date === undefined ? null : dayName(locale, date);
  };
  // Worked out once per render: each look-up scans the plan's stops.
  const inPlanBy = new Map(ideas.map((idea) => [idea.id, stopDay(idea)] as const));
  const placeable = ideas.filter((idea) => inPlanBy.get(idea.id) == null);
  const summary = ideasSummary(placeable);
  const photos = usePlaceTilePhotos(
    ideas.flatMap((idea) => (idea.poiId === null ? [] : [idea.poiId])),
  );

  /** The idea's line: where it fits, the day it is already on, or why there is no fit yet. */
  const lineOf = (idea: Idea): FitLine => {
    const inPlan = inPlanBy.get(idea.id) ?? null;
    const line =
      inPlan === null
        ? fitLine(idea.fit, { weekdays, tz, stopName })
        : { text: inPlanFitLine(inPlan), tone: 'none' as const };
    return (
      line ?? {
        text:
          beforePlan !== null
            ? fitsNeedPlan()
            : t({ id: 'plan.ideas.fitPending', message: 'Fits will update with signal' }),
        tone: 'none',
      }
    );
  };

  const onRemove = (idea: Idea, forEveryone: boolean) => {
    setGone((current) => new Set([...current, idea.id]));
    void remove.send({ idea_id: idea.id, ...(forEveryone ? { for_everyone: true as const } : {}) });
    toast.dismiss();
    toast.show({
      id: removedToastId(idea.id),
      title: namer.name(idea),
      subtitle: removedToast(forEveryone),
      action: {
        label: undoLabel(),
        onPress: () => {
          toast.dismiss();
          setGone((current) => new Set([...current].filter((id) => id !== idea.id)));
          void save.send({
            idea_id: generateUuidV7(),
            trip_id: tripId,
            ...(idea.poiId === null
              ? { pin: { name: idea.name, lat: idea.lat, lng: idea.lng } }
              : { poi_id: idea.poiId }),
            source: 'save',
          });
        },
      },
    });
  };

  const onPlace = async () => {
    setStarting(true);
    const result = await start.send({
      trip_id: tripId,
      ...(placeable.length === ideas.length ? {} : { idea_ids: placeable.map((idea) => idea.id) }),
    });
    setStarting(false);
    const jobId = (result.kind === 'applied' ? (result.result as { job_id?: string }) : null)
      ?.job_id;
    if (jobId === undefined) {
      toast.show({ id: 'plan-ideas-place-failed', ...placeFailedToast(guideName) });
      return;
    }
    router.push(placingRoute(tripId, jobId));
  };

  const openPlace = (idea: Idea) => {
    const split = idea.fit?.days.some((day) =>
      day.reasons.some((reason) => reason.code === 'crew_split'),
    );
    const params = { tripId, placeId: idea.poiId ?? '' };
    const ids = split === true ? SPLIT_IDS : PLACE_IDS;
    const href: Href | undefined =
      idea.poiId === null
        ? undefined
        : ids.map((id) => hrefFor(id, params)).find((found) => found !== undefined);
    if (href === undefined) openAdd(idea.poiId ?? idea.id);
    else router.push(href);
  };

  return {
    saved,
    guideName,
    namer,
    ideas,
    placeable,
    summary,
    inPlanBy,
    photos,
    names,
    starting,
    mapHref,
    searchHref,
    lineOf,
    openAdd,
    openPlace,
    onRemove,
    onPlace,
  };
}

export type IdeasModel = ReturnType<typeof useIdeasModel>;
