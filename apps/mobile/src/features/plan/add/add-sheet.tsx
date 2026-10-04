/**
 * Add to plan (7f-1), one sheet for every add: Tokek's day and time first (or the day it was
 * dropped on), a fit dot on every day, and picking another day or time moves the block and redoes
 * the reasons on the phone. An organiser's ADD goes into the plan (with the nearby place when
 * ticked); a member's becomes a change set sent to the crew. "Just save it for later" keeps it in
 * the trip's Ideas instead. Offline it still adds from the last fit, which the queue sends later.
 */
import { generateStableId, generateUuidV7 } from '@cp/domain';
import { visitMinutes } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFit } from '@/data/fit/local-fit';
import { instantOnDay, minutesOnDay } from '@/data/plan/plan-model';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { useDayEditing } from '@/features/plan/day/use-day-editing';
import { dayTileColour, weekdayOf } from '@/features/plan/overview/day-card';
import { useLocale } from '@/lib/i18n/use-locale';
import { impact } from '@/motion/feedback';
import { toast } from '@/motion/island-toast';
import type { DayChip } from '@/ui/planning';

import { usePlanGuide } from '../plan-guide';
import { saveIdeaCommand } from '../ideas/commands';
import { AddBlock } from './add-block';
import {
  addLabel,
  alreadyLine,
  moveLabel,
  blockDetail,
  dayHeader,
  leaveLine,
  lengthLabel,
  nearbyLine,
  nowhereNote,
  offlineNote,
  pickedLine,
  reasonTiles,
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
  type AddPreset,
} from './add-model';
import { AddSheetView } from './add-sheet-view';
import { useAddFit, useFitPlace, useNearbyPlace } from './use-add-fit';
import { resolvePreset, type RoutePreset } from './routes';
import { useAddSubject } from './use-add-subject';
import { WhoGoing } from './who-going';

export interface AddSheetProps {
  readonly tripId: string;
  /** A place id, or a dropped pin's idea id. */
  readonly placeId: string;
  readonly preset: RoutePreset;
  /** "+ right after this stop": the stop's stable id. */
  readonly afterStableId?: string | undefined;
}

const close = () => (router.canGoBack() ? router.back() : undefined);

export function AddSheet({ tripId, placeId, preset: route, afterStableId }: AddSheetProps) {
  const { t } = useLingui();
  const locale = useLocale();
  const plan = useTripPlan(tripId);
  const guide = usePlanGuide().name;
  const editor = useDayEditing(plan);
  const saveIdea = useCommand(saveIdeaCommand);
  const { subject } = useAddSubject(tripId, placeId);
  const tz = plan.trip?.tz ?? 'UTC';
  const poiId = subject?.poiId ?? null;
  const server = useAddFit(tripId, poiId, plan.versionId);
  const fitPlace = useFitPlace(tripId, poiId, subject);
  const nearby = useNearbyPlace(tripId, poiId);
  const [picked, setPicked] = useState<AddChoice | null>(null);
  const [lengthMin, setLengthMin] = useState<number | null>(null);
  const [editingTime, setEditingTime] = useState(false);
  const [withNearby, setWithNearby] = useState(false);
  const [out, setOut] = useState<ReadonlySet<string>>(new Set());
  const [whoOpen, setWhoOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stableIds] = useState<[string, string]>(() => [generateStableId(), generateStableId()]);

  const days = useMemo(
    () =>
      plan.dayRows.flatMap((row) =>
        row.date === null ? [] : [{ dayNo: row.day_no, date: row.date }],
      ),
    [plan.dayRows],
  );
  const given = resolvePreset(route, plan.dayRows, tz);
  const afterRow = plan.itemRows.find((row) => row.stable_id === afterStableId);
  const afterDate = days.find((entry) => entry.dayNo === afterRow?.day_no)?.date ?? null;
  // A place already in the plan opens on its own stop, and ADD becomes "Move it".
  const existing =
    subject?.poiId == null ? undefined : plan.itemRows.find((row) => row.poi_id === subject.poiId);
  const existingDate = days.find((entry) => entry.dayNo === existing?.day_no)?.date ?? null;
  const preset: AddPreset =
    afterRow?.ends_at != null && afterDate !== null
      ? { after: { dayNo: afterRow.day_no, endMin: minutesOnDay(afterRow.ends_at, tz, afterDate) } }
      : existing?.starts_at != null && existingDate !== null && given.dayNo === undefined
        ? {
            dayNo: existing.day_no,
            startMin: minutesOnDay(existing.starts_at, tz, existingDate),
          }
        : given;
  const choice = picked ?? initialChoice(server.fit, preset, days, tz);
  const day = days.find((entry) => entry.dayNo === choice?.dayNo) ?? null;
  const at =
    choice?.timePicked === true && day !== null
      ? new Date(instantOnDay(day.date, choice.startMin, tz))
      : undefined;
  const local = useLocalFit(server.context, fitPlace, { at });
  const shown = choice === null ? null : shownDayFit(choice, server.fit, local);
  const grades = dayGrades(server.fit);
  const length = lengthMin ?? (choice === null ? 90 : blockLength(server.fit, choice.dayNo));

  const label = (date: string, dayNo: number) => {
    const weekday = weekdayOf(date, locale).toUpperCase();
    return `${weekday} ${String(Number(date.slice(8, 10)))}`.trim() || String(dayNo);
  };
  const chips: DayChip[] = days.map((entry) => ({
    dayNo: entry.dayNo,
    weekday: weekdayOf(entry.date, locale),
    color: dayTileColour(entry.dayNo),
    fit: grades.get(entry.dayNo),
    accessibilityLabel: label(entry.date, entry.dayNo),
  }));
  const dayLabel = day === null ? '' : label(day.date, day.dayNo);
  const month =
    day === null
      ? ''
      : new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(
          // Midday UTC keeps the calendar date in every zone.
          // eslint-disable-next-line lingui/no-unlocalized-strings
          new Date(`${day.date}T12:00:00Z`),
        );
  const time = choice === null ? '' : clockOf(choice.startMin);
  const members = plan.members.map((member) => ({
    key: member.uid,
    name: member.name,
    joinIndex: member.joinIndex,
  }));
  const nearbyAdd =
    nearby === null
      ? null
      : {
          poiId: nearby.poi_id,
          name: nearby.name,
          category: nearby.category,
          minutes: nearby.minutes,
          lengthMin: visitMinutes({ category: nearby.category, timeNeededMin: null }),
        };
  const nothingFits = server.fit !== null && server.fit.best === null;
  const existingLabel =
    existing === undefined || existingDate === null ? null : label(existingDate, existing.day_no);
  const note =
    existingLabel !== null
      ? alreadyLine(existingLabel)
      : server.status === 'offline' && server.fit === null
        ? offlineNote(guide)
        : nothingFits
          ? nowhereNote()
          : null;

  const onAdd = async () => {
    if (choice === null || day === null || subject === null) return;
    setBusy(true);
    const ops =
      existing !== undefined
        ? moveStopOps(existing.stable_id, choice, day, tz, length)
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
    const outcome = await editor.submit(ops);
    setBusy(false);
    if (outcome.kind === 'unavailable') return;
    impact('success');
    close();
  };

  const onSaveLater = async () => {
    if (subject === null) return;
    await saveIdea.send({
      idea_id: subject.ideaId ?? generateUuidV7(),
      trip_id: tripId,
      ...(subject.poiId === null
        ? { pin: { name: subject.name, lat: subject.lat, lng: subject.lng } }
        : { poi_id: subject.poiId }),
      source: 'save',
    });
    toast.show({
      id: 'plan-add-saved',
      title: t({ id: 'plan.add.savedToast', message: 'Saved to Ideas' }),
    });
    close();
  };

  return (
    <AddSheetView
      name={(subject?.name ?? '').toUpperCase()}
      line={pickedLine(guide)}
      days={chips}
      dayNo={choice?.dayNo ?? null}
      onDay={(dayNo) => {
        if (choice === null) return;
        impact('tick');
        setPicked(pickDay(choice, dayNo, server.fit, tz));
        setLengthMin(null);
      }}
      dayHeader={dayHeader(dayLabel, shown)}
      block={
        <AddBlock
          leave={choice === null ? null : leaveLine(shown, choice.startMin)}
          time={time}
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
          nearby={
            nearbyAdd === null || choice === null
              ? null
              : {
                  time: clockOf(choice.startMin + length + nearbyAdd.minutes),
                  text: nearbyLine(nearbyAdd.name, nearbyAdd.minutes),
                  picked: withNearby,
                  onToggle: () => setWithNearby((on) => !on),
                }
          }
        />
      }
      whyTitle={whyTitle(time)}
      reasons={reasonTiles(shown, month)}
      note={note}
      who={
        <WhoGoing
          members={members}
          out={out}
          open={whoOpen}
          onOpen={() => setWhoOpen((open) => !open)}
          onToggle={(uid) =>
            setOut((current) => {
              const next = new Set(current);
              if (next.has(uid)) next.delete(uid);
              else if (next.size < members.length - 1) next.add(uid);
              return next;
            })
          }
        />
      }
      cta={
        existing === undefined ? addLabel(dayLabel, time, plan.canApply) : moveLabel(dayLabel, time)
      }
      busy={busy || editor.pending}
      disabled={choice === null || subject === null}
      onAdd={() => void onAdd()}
      onSaveLater={subject === null ? null : () => void onSaveLater()}
    />
  );
}
