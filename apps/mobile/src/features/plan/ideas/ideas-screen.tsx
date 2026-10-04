/**
 * Ideas (7f-2): everything the crew saved for the trip that isn't in a day yet, from search, links,
 * swipes and the map, each saying where it would fit. A row dragged onto a day opens Add to plan on
 * that day; PLACE THEM FOR ME has Tokek place them in the background (7h-6). Synced rows only, so
 * the list reads the same offline; fit lines then wait for signal.
 */
import { t } from '@lingui/core/macro';
import { router, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { fitLine } from '@/data/fit/fit-line';
import { useTripIdeas } from '@/data/ideas/use-trip-ideas';
import { screenCredits, usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { dayTileColour, weekdayOf } from '@/features/plan/overview/day-card';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor, useScreenHref } from '@/lib/navigation/screen-registry';
import { impact } from '@/motion/feedback';
import { toast } from '@/motion/island-toast';
import { PhotoCredit, type DayChip } from '@/ui/planning';

import { addRoute } from '../add/routes';
import { ideaIcon } from './idea-icon';
import { IdeaRow } from './idea-row';
import { gradesByDay, ideasSummary } from './ideas-model';
import { IdeasView } from './ideas-view';
import { placingRoute } from './routes';
import { startIdeaPlacementOnline } from './commands';
import { bodyText, emptyBody, emptyLine, placeLine } from './ideas-copy';
import { useDragToDay } from './use-drag-to-day';

/* eslint-disable lingui/no-unlocalized-strings -- design ids and route params below, never copy. */
const MAP_ID = '7c-1';
const PLACE_IDS = ['7e-1', '3d-3'] as const;
const SPLIT_IDS = ['7e-3', '7e-1', '3d-3'] as const;
const IDEAS_FILTER = { filter: 'ideas' } as const;
/* eslint-enable lingui/no-unlocalized-strings */

export function IdeasScreen({ tripId }: { readonly tripId: string }) {
  const locale = useLocale();
  const plan = useTripPlan(tripId);
  const { ideas, loaded } = useTripIdeas(tripId);
  const start = useCommand(startIdeaPlacementOnline);
  const [starting, setStarting] = useState(false);
  const mapHref = useScreenHref(MAP_ID, { tripId, ...IDEAS_FILTER });
  const tz = plan.trip?.tz ?? 'UTC';
  const days = useMemo(
    () =>
      plan.dayRows.flatMap((row) =>
        row.date === null ? [] : [{ dayNo: row.day_no, date: row.date }],
      ),
    [plan.dayRows],
  );
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
    weekday: weekdays.get(day.dayNo) ?? '',
    color: dayTileColour(day.dayNo),
    fit: dragged === null ? undefined : (grades.get(day.dayNo) ?? 'no'),
    accessibilityLabel: `${weekdays.get(day.dayNo) ?? ''} ${day.date.slice(8, 10)}`,
  }));
  const names = new Map(plan.members.map((member) => [member.uid, member]));
  const stopName = (stableId: string) => plan.display.get(stableId)?.title ?? null;
  const summary = ideasSummary(ideas);

  const onPlace = async () => {
    setStarting(true);
    const result = await start.send({ trip_id: tripId });
    setStarting(false);
    const jobId = (result.kind === 'applied' ? (result.result as { job_id?: string }) : null)
      ?.job_id;
    if (jobId === undefined) {
      toast.show({
        id: 'plan-ideas-place-failed',
        title: t({ id: 'plan.ideas.placeFailed', message: 'Tokek couldn’t start placing them' }),
        subtitle: t({ id: 'plan.ideas.placeFailedLine', message: 'Try again with signal.' }),
      });
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
    const line = fitLine(idea.fit, { weekdays, tz, stopName });
    return (
      <IdeaRow
        key={idea.id}
        ideaId={idea.id}
        name={idea.name.toUpperCase()}
        icon={ideaIcon(idea.category)}
        photo={idea.poiId === null ? undefined : photos.get(idea.poiId)}
        fitLine={
          line ?? {
            text: t({ id: 'plan.ideas.fitPending', message: 'Fits will update with signal' }),
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
        onAddToDay={() => openAdd(idea.poiId ?? idea.id)}
      />
    );
  });

  return (
    <IdeasView
      body={ideas.length === 0 ? emptyBody() : bodyText(ideas.length)}
      days={chips}
      dropTarget={drag.dragging === null ? undefined : { overDayNo: drag.overDayNo }}
      chipsRef={drag.chipsRef}
      place={
        ideas.length === 0 || plan.versionId === null
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
              guide: plan.trip?.guide_name ?? t({ id: 'plan.ideas.guide', message: 'Tokek' }),
              line: emptyLine(),
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
      onBack={() => (router.canGoBack() ? router.back() : undefined)}
      onMap={mapHref === undefined ? null : () => router.push(mapHref)}
    />
  );
}
