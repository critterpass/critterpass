/**
 * Ideas (7f-2): everything the crew saved for the trip that isn't in a day yet, from search, links,
 * swipes and the map, each saying where it would fit. A row dragged onto a day opens Add to plan on
 * that day; PLACE THEM FOR ME has Tokek place them in the background (7h-6). A row's handle offers
 * Add to a day and the ways to remove it, with UNDO. A place already a stop says so. Before the
 * crew has a plan an organiser places them on her own draft, and a member reads that it is still
 * being put together (./use-ideas-plan.ts).
 */
import { t } from '@lingui/core/macro';
import { router, type Href } from 'expo-router';
import { generateUuidV7 } from '@cp/domain';
import { useCallback, useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { fitLine } from '@/data/fit/fit-line';
import { screenCredits, usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { usePlaceNamer } from '@/data/places/use-shown-names';
import { dayTileColour, weekdayOf } from '@/features/plan/overview/day-card';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor, useScreenHref } from '@/lib/navigation/screen-registry';
import { impact } from '@/motion/feedback';
import { toast } from '@/motion/island-toast';
import { PhotoCredit, type DayChip } from '@/ui/planning';

import { stopOfPlace } from '../add/placed-stop';
import { usePlanGuide } from '../plan-guide';
import { addRoute } from '../add/routes';
import { dayName } from '../day/format';
import { planRoutes } from '../overview/routes';
import { chipWeekday, dayOfMonth } from '../trip-map/format';
import { IdeaActions } from './idea-actions';
import { ideaIcon } from './idea-icon';
import { IdeaRow } from './idea-row';
import { gradesByDay, ideasSummary } from './ideas-model';
import { IdeasView } from './ideas-view';
import { placingRoute } from './routes';
import { removeIdeaCommand, saveIdeaCommand, startIdeaPlacementOnline } from './commands';
import {
  beforePlanBody,
  bodyText,
  draftBodyText,
  emptyBody,
  emptyLine,
  findPlacesLabel,
  placeFailedToast,
  fitsNeedPlan,
  inPlanFitLine,
  placeLine,
  removedToast,
  undoLabel,
} from './ideas-copy';
import { useDragToDay } from './use-drag-to-day';
import { useIdeasPlan } from './use-ideas-plan';

/* eslint-disable lingui/no-unlocalized-strings -- design ids, route params and a toast id below, never copy. */
const MAP_ID = '7c-1';
const PLACE_IDS = ['7e-1', '3d-3'] as const;
const SPLIT_IDS = ['7e-3', '7e-1', '3d-3'] as const;
const SEARCH_ID = '7d-1';
const IDEAS_FILTER = { filter: 'ideas' } as const;
const removedToastId = (ideaId: string) => `plan-idea-removed-${ideaId}`;
/* eslint-enable lingui/no-unlocalized-strings */

export function IdeasScreen({ tripId }: { readonly tripId: string }) {
  const locale = useLocale();
  const saved = useIdeasPlan(tripId);
  const { plan, loaded, days, beforePlan } = saved;
  const guideName = usePlanGuide().name;
  const namer = usePlaceNamer(plan.trip?.destination_id);
  const start = useCommand(startIdeaPlacementOnline);
  const remove = useCommand(removeIdeaCommand);
  const save = useCommand(saveIdeaCommand);
  const [starting, setStarting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Ideas just removed here: gone from the list at once, before the server's own rows sync.
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());
  const ideas = useMemo(
    () => saved.ideas.filter((idea) => !gone.has(idea.id)),
    [saved.ideas, gone],
  );
  const mapHref = useScreenHref(MAP_ID, { tripId, ...IDEAS_FILTER });
  const searchHref = useScreenHref(SEARCH_ID, { tripId, scope: 'trip' });
  const tz = plan.trip?.tz ?? 'UTC';
  const dayNos = useMemo(() => days.map((day) => day.dayNo), [days]);
  const openAdd = useCallback(
    (placeId: string, day?: number) =>
      router.push(addRoute(tripId, placeId, { day, source: 'ideas' })),
    [tripId],
  );
  const placeIdOf = (ideaId: string) => {
    const idea = ideas.find((entry) => entry.id === ideaId);
    return idea === undefined ? null : (idea.poiId ?? idea.id);
  };
  const drag = useDragToDay(dayNos, (ideaId, dayNo) => {
    const placeId = placeIdOf(ideaId);
    if (placeId === null) return;
    impact('snap');
    openAdd(placeId, dayNo);
  });
  const dragged = ideas.find((idea) => idea.id === drag.dragging) ?? null;
  const grades = gradesByDay(dragged?.fit ?? null);
  const weekdays = new Map(days.map((day) => [day.dayNo, weekdayOf(day.date, locale)]));
  const chips: DayChip[] = days.map((day) => ({
    dayNo: day.dayNo,
    weekday: chipWeekday(locale, day.date),
    dateLabel: dayOfMonth(day.date),
    color: dayTileColour(day.dayNo),
    fit: dragged === null ? undefined : (grades.get(day.dayNo) ?? 'no'),
    accessibilityLabel: dayName(locale, day.date),
  }));
  const names = new Map(plan.members.map((member) => [member.uid, member]));
  const stopName = (stableId: string) => plan.display.get(stableId)?.title ?? null;
  // A saved place that is already a stop (the catalogue sometimes holds one place twice).
  const stopDay = (idea: (typeof ideas)[number]): string | null => {
    const row = stopOfPlace(idea, plan.itemRows, stopName);
    const date = days.find((day) => day.dayNo === row?.day_no)?.date;
    return date === undefined ? null : dayName(locale, date);
  };
  const placeable = ideas.filter((idea) => stopDay(idea) === null);
  const summary = ideasSummary(placeable);
  const open = ideas.find((idea) => idea.id === openId) ?? null;

  const onRemove = (idea: (typeof ideas)[number], forEveryone: boolean) => {
    setOpenId(null);
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

  const openPlace = (idea: (typeof ideas)[number]) => {
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

  const photos = usePlaceTilePhotos(
    ideas.flatMap((idea) => (idea.poiId === null ? [] : [idea.poiId])),
  );
  const rows = ideas.map((idea) => {
    const inPlan = stopDay(idea);
    const line =
      inPlan === null
        ? fitLine(idea.fit, { weekdays, tz, stopName })
        : { text: inPlanFitLine(inPlan), tone: 'none' as const };
    return (
      <IdeaRow
        key={idea.id}
        ideaId={idea.id}
        name={namer.name(idea).toUpperCase()}
        icon={ideaIcon(idea.category)}
        photo={idea.poiId === null ? undefined : photos.get(idea.poiId)}
        fitLine={
          line ?? {
            text:
              beforePlan !== null
                ? fitsNeedPlan()
                : t({ id: 'plan.ideas.fitPending', message: 'Fits will update with signal' }),
            tone: 'none',
          }
        }
        savers={idea.backerIds.flatMap((uid) => {
          const member = names.get(uid);
          return member === undefined
            ? []
            : [{ key: uid, name: member.name, joinIndex: member.joinIndex }];
        })}
        frame={drag.frame}
        layout={drag.layout}
        onLift={drag.lift}
        onOver={drag.over}
        onDrop={drag.drop}
        onCancel={drag.cancel}
        onOpen={() => openPlace(idea)}
        onAddToDay={beforePlan !== null ? null : () => openAdd(idea.poiId ?? idea.id)}
        onMore={() => setOpenId(idea.id)}
      />
    );
  });

  return (
    <>
      <IdeasView
        body={
          ideas.length === 0
            ? emptyBody()
            : beforePlan !== null
              ? beforePlanBody(ideas.length, beforePlan.organiser)
              : saved.crewPlan
                ? bodyText(ideas.length, guideName)
                : draftBodyText(ideas.length)
        }
        days={chips}
        dropTarget={drag.dragging === null ? undefined : { overDayNo: drag.overDayNo }}
        chipsRef={drag.chipsRef}
        place={
          placeable.length === 0 || !saved.crewPlan
            ? null
            : {
                line: placeLine(summary.fitting, summary.needCrew + summary.unknown),
                busy: starting,
                onPress: () => void onPlace(),
              }
        }
        empty={
          loaded && ideas.length === 0
            ? {
                guide: guideName,
                line: emptyLine(),
                find:
                  searchHref === undefined
                    ? null
                    : { label: findPlacesLabel(), onPress: () => router.push(searchHref) },
              }
            : null
        }
        rows={
          <>
            {rows}
            <PhotoCredit credits={screenCredits(photos.values())} />
          </>
        }
        scrolls={drag.dragging === null}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace(planRoutes.plan(tripId))
        }
        onMap={mapHref === undefined ? null : () => router.push(mapHref)}
      />
      {open === null ? null : (
        <IdeaActions
          name={namer.name(open).toUpperCase()}
          inPlan={stopDay(open)}
          onAddToDay={
            beforePlan !== null
              ? null
              : () => {
                  setOpenId(null);
                  openAdd(open.poiId ?? open.id);
                }
          }
          onRemoveMine={
            plan.uid !== null && open.backerIds.includes(plan.uid)
              ? () => onRemove(open, false)
              : null
          }
          onRemoveForEveryone={plan.organiser ? () => onRemove(open, true) : null}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}
