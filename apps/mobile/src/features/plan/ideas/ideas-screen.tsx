/**
 * Ideas (7f-2): everything the crew saved for the trip that isn't in a day yet, from search, links,
 * swipes and the map, each saying where it would fit. A row dragged onto a day opens Add to plan on
 * that day; PLACE THEM FOR ME has Tokek place them in the background (7h-6). A row's handle offers
 * Add to a day and the ways to remove it, with UNDO. A place already a stop says so. Before the
 * crew has a plan an organiser places them on her own draft, and a member reads that it is still
 * being put together (./use-ideas-plan.ts). State and actions live in ./use-ideas-model.ts.
 */
import { upper } from '@cp/i18n';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { screenCredits } from '@/data/media/use-place-tile-photos';
import { dayTileColour } from '@/features/plan/overview/model/day-colour';
import { goBackOr } from '@/lib/navigation/back';
import { useLocale } from '@/lib/i18n/use-locale';
import { impact } from '@/motion/feedback';
import { PhotoCredit, type DayChip } from '@/ui/planning';

import { dayName } from '../day/format';
import { planRoutes } from '../overview/routes';
import { chipWeekday, dayOfMonth } from '../trip-map/format';
import { IdeaActions } from './idea-actions';
import { ideaIcon } from './idea-icon';
import { IdeaRow } from './idea-row';
import { gradesByDay } from './ideas-model';
import { IdeasView } from './ideas-view';
import {
  beforePlanBody,
  bodyText,
  draftBodyText,
  emptyBody,
  emptyLine,
  findPlacesLabel,
  placeLine,
} from './ideas-copy';
import { useDragToDay } from './use-drag-to-day';
import { useIdeasModel } from './use-ideas-model';

export function IdeasScreen({ tripId }: { readonly tripId: string }) {
  const locale = useLocale();
  const model = useIdeasModel(tripId);
  const { saved, ideas, placeable, summary, inPlanBy, photos, names, namer, guideName } = model;
  const { plan, loaded, days, beforePlan } = saved;
  const [openId, setOpenId] = useState<string | null>(null);
  const dayNos = useMemo(() => days.map((day) => day.dayNo), [days]);
  const placeIdOf = (ideaId: string) => {
    const idea = ideas.find((entry) => entry.id === ideaId);
    return idea === undefined ? null : (idea.poiId ?? idea.id);
  };
  const drag = useDragToDay(dayNos, (ideaId, dayNo) => {
    const placeId = placeIdOf(ideaId);
    if (placeId === null) return;
    impact('snap');
    model.openAdd(placeId, dayNo);
  });
  const dragged = ideas.find((idea) => idea.id === drag.dragging) ?? null;
  const grades = gradesByDay(dragged?.fit ?? null);
  const chips: DayChip[] = days.map((day) => ({
    dayNo: day.dayNo,
    weekday: chipWeekday(locale, day.date),
    dateLabel: dayOfMonth(day.date),
    color: dayTileColour(day.dayNo),
    fit: dragged === null ? undefined : (grades.get(day.dayNo) ?? 'no'),
    accessibilityLabel: dayName(locale, day.date),
  }));
  const open = ideas.find((idea) => idea.id === openId) ?? null;
  const onRemove = (idea: (typeof ideas)[number], forEveryone: boolean) => {
    setOpenId(null);
    model.onRemove(idea, forEveryone);
  };
  const searchHref = model.searchHref;
  const mapHref = model.mapHref;

  const rows = ideas.map((idea) => (
    <IdeaRow
      key={idea.id}
      ideaId={idea.id}
      name={upper(namer.name(idea), locale)}
      icon={ideaIcon(idea.category)}
      photo={idea.poiId === null ? undefined : photos.get(idea.poiId)}
      fitLine={model.lineOf(idea)}
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
      onOpen={() => model.openPlace(idea)}
      onAddToDay={beforePlan !== null ? null : () => model.openAdd(idea.poiId ?? idea.id)}
      onMore={() => setOpenId(idea.id)}
    />
  ));

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
                busy: model.starting,
                onPress: () => void model.onPlace(),
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
        onBack={() => goBackOr(planRoutes.plan(tripId))}
        onMap={mapHref === undefined ? null : () => router.push(mapHref)}
      />
      {open === null ? null : (
        <IdeaActions
          name={upper(namer.name(open), locale)}
          inPlan={inPlanBy.get(open.id) ?? null}
          onAddToDay={
            beforePlan !== null
              ? null
              : () => {
                  setOpenId(null);
                  model.openAdd(open.poiId ?? open.id);
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
