/**
 * Add to plan (7f-1), one sheet for every add: the day it was opened from (or Tokek's day and time),
 * a fit dot on every day, and picking another day or time moves the block and redoes the reasons
 * on the phone. An organiser's ADD goes into the plan (with the nearby place when ticked); a
 * member's becomes a change set sent to the crew; either way the editor says where it landed, with
 * UNDO. While the fit is still coming the button waits; when no day fits it saves to Ideas until a
 * day is picked; a place already in the plan is only ever moved, never added twice. "Just save it
 * for later" keeps it in the trip's Ideas instead. Offline it still adds from the last fit, which
 * the queue sends later.
 */
import { generateStableId } from '@cp/domain';
import { router, useRootNavigationState } from 'expo-router';
import { useState } from 'react';

import { useLocalFit } from '@/data/fit/local-fit';
import { instantOnDay } from '@/data/plan/plan-model';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { useDayEditing } from '@/features/plan/day/use-day-editing';
import { useLocale } from '@/lib/i18n/use-locale';
import { impact } from '@/motion/feedback';

import { usePlanGuide } from '../plan-guide';
import { AddBlock } from './add-block';
import { whyTiles, type WhyInput } from './add-kind-copy';
import { openStartOn, settleAdd, useStartOf } from './add-into-day';
import {
  blockDetail,
  dayHeader,
  leaveLine,
  lengthLabel,
  nearbyLine,
  offlineNote,
  whyTitle,
} from './add-copy';
import {
  addOps,
  blockLength,
  clockOf,
  dayGrades,
  initialChoice,
  moveStopOps,
  pickDay,
  pickTime,
  shownDayFit,
  type AddChoice,
} from './add-model';
import { AddSheetView } from './add-sheet-view';
import { isWhereItIs } from './placed-stop';
import { guidePickLabel, sheetWords, voteNote } from './add-states-copy';
import { nearbyAddOf, useAddFit, useFitPlace, useNearbyPlace } from './use-add-fit';
import { addTarget } from './add-target';
import { originDayId, type RoutePreset } from './routes';
import { useAddDays } from './use-add-days';
import { useAddSubject } from './use-add-subject';
import { useSaveToIdeas } from './use-save-to-ideas';
import { toggledOut, WhoGoing } from './who-going';

export interface AddSheetProps {
  readonly tripId: string;
  /** A place id, or a dropped pin's idea id. */
  readonly placeId: string;
  readonly preset: RoutePreset;
  /** "+ right after this stop": the stop's stable id. */
  readonly afterStableId?: string | undefined;
}

const close = () => (router.canGoBack() ? router.back() : undefined);
const WAITING_TIME = '··:··';

export function AddSheet({ tripId, placeId, preset: route, afterStableId }: AddSheetProps) {
  const locale = useLocale();
  const plan = useTripPlan(tripId);
  const guide = usePlanGuide().name;
  const editor = useDayEditing(plan);
  const saveToIdeas = useSaveToIdeas(tripId);
  const { subject, loaded: subjectRead } = useAddSubject(tripId, placeId);
  const tz = plan.trip?.tz ?? 'UTC';
  const poiId = subject?.poiId ?? null;
  const server = useAddFit(tripId, poiId, plan.versionId);
  const fitPlace = useFitPlace(tripId, poiId, subject);
  const nearby = useNearbyPlace(tripId, poiId);
  // The day the sheet was opened from, when the screen in between passed only the place.
  const origin = originDayId(useRootNavigationState());
  const [picked, setPicked] = useState<AddChoice | null>(null);
  const [lengthMin, setLengthMin] = useState<number | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  const [withNearby, setWithNearby] = useState(false);
  const [out, setOut] = useState<ReadonlySet<string>>(new Set());
  const [whoOpen, setWhoOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stableIds] = useState<[string, string]>(() => [generateStableId(), generateStableId()]);

  const { days, labelOf, chips, monthOf } = useAddDays(plan, locale);
  const { preset, existing } = addTarget({
    route,
    origin,
    afterStableId,
    subject,
    days,
    tz,
    dayRows: plan.dayRows,
    itemRows: plan.itemRows,
    titleOf: (id) => plan.display.get(id)?.title ?? null,
  });
  // The phone has not read the place or the plan yet (a sync batch can hold its reads for a few
  // seconds): the sheet waits, and never reads as blank or as having no signal.
  const reading = !subjectRead || !plan.loaded || subject === null;
  // Nothing says where it goes yet: the answer is still on its way.
  const waiting =
    reading ||
    (picked === null &&
      poiId !== null &&
      server.status === 'loading' &&
      server.fit === null &&
      preset.after === undefined &&
      preset.startMin === undefined);
  const openStart = (dayNo: number) => openStartOn(plan, dayNo, tz);
  const first = picked ?? initialChoice(server.fit, preset, days, tz, existing, openStart);
  const day = days.find((entry) => entry.dayNo === first?.dayNo) ?? null;
  const at =
    first?.timePicked === true && day !== null
      ? new Date(instantOnDay(day.date, first.startMin, tz))
      : undefined;
  const local = useLocalFit(server.context, fitPlace, { at });
  const shown = first === null ? null : shownDayFit(first, server.fit, local);
  const length = lengthMin ?? (first === null ? 90 : blockLength(server.fit, first.dayNo));
  const members = plan.members.map((member) => ({
    key: member.uid,
    name: member.name,
    joinIndex: member.joinIndex,
  }));
  const nearbyAdd = nearbyAddOf(nearby);
  // No day takes it and none was chosen: the place goes to Ideas until a day is picked.
  const nowhere =
    existing === null &&
    server.fit !== null &&
    server.fit.best === null &&
    picked === null &&
    preset.dayNo === undefined &&
    preset.after === undefined;
  const anyway = existing === null && server.fit !== null && shown?.grade === 'no' && !nowhere;
  // The suggestion and the refusal come from one rule: what the sheet opens on can be added.
  const { choice, into } = settleAdd({
    plan,
    day,
    tz,
    locale,
    first,
    shown,
    subject,
    stableId: stableIds[0],
    lengthMin: length,
    skip: existing !== null || nowhere || waiting,
  });
  const stays = isWhereItIs(choice, existing);
  const dayLabel = day === null ? '' : labelOf(day.dayNo);
  const time = choice === null ? '' : clockOf(choice.startMin);
  const best = server.fit?.best ?? null;
  const guidePick =
    best === null || choice === null || existing !== null || best.day_no === choice.dayNo
      ? null
      : {
          label: guidePickLabel(guide, labelOf(best.day_no)),
          onPress: () => {
            impact('tick');
            setPicked(pickDay(choice, best.day_no, server.fit, tz));
            setLengthMin(null);
          },
        };

  const stopName = (stableId: string) => plan.display.get(stableId)?.title ?? null;
  const nearbySlot =
    nearbyAdd === null || choice === null || existing !== null || waiting
      ? null
      : {
          time: clockOf(choice.startMin + length + nearbyAdd.minutes),
          text: nearbyLine(nearbyAdd.name, nearbyAdd.minutes),
          picked: withNearby,
          onToggle: () => setWithNearby((on) => !on),
        };
  const why: WhyInput = {
    day: shown,
    month: day === null ? '' : monthOf(day.date),
    stopName,
    place: fitPlace,
    tz,
    lengthMin: length,
    timePicked: choice?.timePicked === true,
  };
  const words = sheetWords({
    waiting,
    nowhere,
    anyway,
    stays,
    inPlan:
      existing === null
        ? null
        : { dayLabel: labelOf(existing.dayNo), time: clockOf(existing.startMin) },
    guide,
    dayLabel,
    time,
    organiser: plan.canApply,
  });

  const onAdd = async () => {
    if (choice === null || day === null || subject === null) return;
    setBusy(true);
    const ops =
      existing !== null
        ? moveStopOps(existing.stableId, choice, day, tz, length)
        : addOps({
            choice,
            day,
            tz,
            place: {
              poiId: subject.poiId,
              name: subject.name,
              category: subject.category,
              pin: { lat: subject.lat, lng: subject.lng },
            },
            lengthMin: length,
            attendeeIds:
              out.size === 0 ? [] : members.map((m) => m.key).filter((uid) => !out.has(uid)),
            nearby: withNearby ? nearbyAdd : null,
            stableIds,
          });
    const outcome = await editor.submit([...ops, ...(into?.ops ?? [])], { label: subject.name });
    setBusy(false);
    if (outcome.kind === 'unavailable') return;
    close();
  };

  const onSaveLater = async () => {
    if (subject === null) return;
    await saveToIdeas(subject);
    close();
  };

  return (
    <AddSheetView
      name={(subject?.name ?? '').toUpperCase()}
      line={words.line}
      days={chips(dayGrades(server.fit))}
      dayNo={nowhere ? null : (choice?.dayNo ?? null)}
      onDay={(dayNo) => {
        if (choice === null) return;
        impact('tick');
        setPicked(pickDay(choice, dayNo, server.fit, tz, openStart));
        setLengthMin(null);
      }}
      guidePick={guidePick}
      dayHeader={nowhere ? '' : dayHeader(dayLabel, shown)}
      block={
        nowhere ? null : (
          <AddBlock
            leave={choice === null || waiting ? null : leaveLine(shown, choice.startMin)}
            time={waiting ? WAITING_TIME : time}
            length={lengthLabel(length)}
            name={(subject?.name ?? '').toUpperCase()}
            detail={blockDetail(shown)}
            editingTime={editingTime}
            onTime={() => setEditingTime((open) => !open)}
            start={choice?.startMin ?? 0}
            end={(choice?.startMin ?? 0) + length}
            onTimeChange={(start, end) => {
              if (choice === null) return;
              setPicked(pickTime(choice, start));
              setLengthMin(end - start);
            }}
            nearby={nearbySlot}
          />
        )
      }
      whyTitle={nowhere || waiting ? '' : whyTitle(time)}
      reasons={nowhere || waiting ? [] : whyTiles(why)}
      note={
        into?.line ??
        (!reading && server.status === 'offline' && server.fit === null ? offlineNote(guide) : null)
      }
      who={
        <WhoGoing
          members={members}
          out={out}
          open={whoOpen}
          onOpen={() => setWhoOpen((open) => !open)}
          onToggle={(uid) => setOut((current) => toggledOut(current, uid, members.length))}
        />
      }
      useStart={useStartOf(into, (start) => choice !== null && setPicked(pickTime(choice, start)))}
      voteNote={plan.canApply || nowhere || waiting ? null : voteNote()}
      cta={words.cta}
      busy={busy || editor.pending}
      disabled={choice === null || subject === null || waiting || stays || into?.blocked === true}
      onAdd={() => void (nowhere ? onSaveLater() : onAdd())}
      onSaveLater={subject === null || nowhere ? null : () => void onSaveLater()}
    />
  );
}
