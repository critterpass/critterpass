/**
 * Fill a gap (7h-2) for one free window: who is free and where the others are (the gap ideas
 * route), Tokek's ideas with names from the synced places, the picked idea's little route drawn on
 * the trip map behind the sheet, and ADD, which puts the picked places in the window for the free
 * people (an organiser applies, a member suggests). "Something else" opens search on that day.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, ids and screen ids, never copy. */
import { generateStableId, visitMinutes, type GapIdea, type PlanOp } from '@cp/domain';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { resolveMemberStyle, tokens } from '@cp/design-tokens';

import { clearMapPreview, showMapPreview } from '@/data/plan/map-preview';
import { instantOnDay } from '@/data/plan/plan-model';
import { useLiveRows } from '@/data/plan/live-rows';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { useDayEditing } from '@/features/plan/day/use-day-editing';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { toast } from '@/motion/island-toast';

import { fixerPaths, readGapIdeas, useFixerRead } from '../data/fixer-api';
import { useCheckContext } from '../data/use-check-context';
import { compactMoney, dayTag } from '../format';
import * as copy from './gap-copy';
import { GapView, type GapIdeaView } from './gap-view';

const OWNER = 'fill-gap';
const PLACES_SQL =
  'SELECT id, name, category, lat, lng FROM pois WHERE id IN (SELECT value FROM json_each(?))';
const PLACES_TABLES = ['pois'];

interface PlaceRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
}

const minuteOf = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
const ceil15 = (minute: number) => Math.ceil(minute / 15) * 15;

export interface GapSheetProps {
  readonly tripId: string;
  readonly dayId: string;
  /** The day's number, for a caller that had no day id. */
  readonly dayNo?: number | null;
  readonly start: string;
  readonly end: string;
}

export function GapSheet({ tripId, dayId: givenDayId, dayNo, start, end }: GapSheetProps) {
  const plan = useTripPlan(tripId);
  const dayId =
    givenDayId !== '' ? givenDayId : (plan.dayRows.find((row) => row.day_no === dayNo)?.id ?? '');
  const editor = useDayEditing(plan);
  const ctx = useCheckContext(plan);
  const locale = useLocale();
  const path = useMemo(
    () => (dayId === '' ? null : fixerPaths.gapIdeas(tripId, { dayId, start, end })),
    [tripId, dayId, start, end],
  );
  const read = useFixerRead(path, plan.trip?.current_version_id ?? null, readGapIdeas);
  const answer = read.data;
  const ids = (answer?.ideas ?? []).flatMap((idea) => idea.poi_ids);
  const places = useLiveRows<PlaceRow>(
    PLACES_SQL,
    ids.length === 0 ? null : [JSON.stringify(ids)],
    PLACES_TABLES,
  );
  const byId = new Map(places.rows.map((row) => [row.id, row]));
  const [picked, setPicked] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const member = (uid: string) => plan.members.find((entry) => entry.uid === uid);
  const nameOf = (uid: string) => member(uid)?.name ?? '';
  const date = ctx.dayDate(dayId);
  const day = plan.dayRows.find((row) => row.id === dayId) ?? null;
  const tz = plan.trip?.tz ?? 'UTC';

  const ideaView = (idea: GapIdea, index: number): GapIdeaView => {
    const [a, b] = idea.poi_ids.map((poi) => byId.get(poi)?.name ?? '');
    const saver = idea.saver_id === null ? null : nameOf(idea.saver_id);
    const voter = idea.voted_by[0] === undefined ? null : nameOf(idea.voted_by[0]);
    const closes = idea.reasons.find((reason) => reason.code === 'closes_at');
    const title =
      idea.kind === 'stay'
        ? copy.stayTitle()
        : idea.kind === 'pair'
          ? copy.pairTitle(a ?? '', b ?? '')
          : (a ?? '');
    const lines = [
      saver === null ? null : `${a ?? ''}, ${copy.saveOf(saver)}.`,
      closes === undefined ? null : copy.closesLine(b ?? a ?? '', String(closes.params.time)),
    ].filter((line): line is string => line !== null);
    const money =
      idea.cost_each_minor === null || idea.currency === null
        ? null
        : idea.cost_each_minor === 0
          ? copy.freeChip()
          : copy.eachChip(compactMoney(idea.cost_each_minor, idea.currency, locale));
    return {
      key: String(index),
      title,
      body: idea.kind === 'stay' ? copy.stayBody(voter) : lines.join(' '),
      tags: [
        ...(idea.kind === 'stay' ? [] : [{ label: copy.minutesChip(idea.minutes) }]),
        ...(money === null
          ? idea.kind === 'stay'
            ? [{ label: copy.freeChip() }]
            : []
          : [{ label: money }]),
        ...(saver === null
          ? []
          : [
              {
                label: copy.saveOf(saver),
                color: resolveMemberStyle(member(idea.saver_id ?? '')?.joinIndex ?? 0).color,
              },
            ]),
      ],
    };
  };
  const ideas = (answer?.ideas ?? []).map(ideaView);
  const chosen = answer?.ideas[picked] ?? null;

  useEffect(() => {
    if (chosen === null || chosen.kind === 'stay') {
      clearMapPreview(OWNER);
      return undefined;
    }
    const stops = chosen.poi_ids.flatMap((poi) => {
      const row = byId.get(poi);
      return row === undefined ? [] : [{ key: poi, lat: row.lat, lng: row.lng }];
    });
    if (stops.length > 0) {
      showMapPreview({
        owner: OWNER,
        route: stops.map((stop) => [stop.lng, stop.lat] as const),
        color: tokens.color.yellow,
        stops,
      });
    }
    return () => clearMapPreview(OWNER);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the pick and its places decide it.
  }, [chosen, places.rows]);

  const freeIds = answer?.who_free ?? [];
  const everyone = plan.members.length;
  const opsFor = (idea: GapIdea): PlanOp[] => {
    if (day === null || date === null) return [];
    let cursor = ceil15(minuteOf(start));
    return idea.poi_ids.flatMap((poi, index) => {
      const row = byId.get(poi);
      if (row === undefined) return [];
      if (index > 0) cursor = ceil15(cursor + Math.max(15, Math.round(idea.minutes / 2)));
      const length = visitMinutes({ category: row.category });
      const from = cursor;
      cursor = from + length;
      return [
        {
          op: 'add',
          item: generateStableId(),
          new: {
            day_no: day.day_no,
            starts_at: instantOnDay(date, from, tz),
            ends_at: instantOnDay(date, Math.min(cursor, minuteOf(end)), tz),
            tz,
            poi_id: poi,
            category: row.category,
            attendee_ids: freeIds.length >= everyone ? [] : [...freeIds],
          },
        } satisfies PlanOp,
      ];
    });
  };

  const busyText = (answer?.context.busy ?? []).map((entry) => {
    const names = entry.user_ids.map(nameOf).filter((name) => name !== '');
    const place = ctx.name(entry.stable_id);
    return names.length === 1
      ? copy.busyOneLine(names[0] ?? '', place, entry.until)
      : copy.busyLine(copy.andNames(names), place, entry.until);
  });
  const next = answer?.context.next_item ?? null;
  const nextAt = next === null ? null : ctx.startOf(next);
  const context = [
    ...busyText,
    ...(next === null || nextAt === null ? [] : [copy.nextLine(ctx.name(next), nextAt)]),
  ].join(' ');

  return (
    <GapView
      window={copy.windowLabel(date === null ? '' : dayTag(date), start, end)}
      title={copy.freeTitle(freeIds.length)}
      free={freeIds.flatMap((uid) => {
        const entry = member(uid);
        return entry === undefined
          ? []
          : [{ key: uid, name: entry.name, joinIndex: entry.joinIndex }];
      })}
      context={context}
      eyebrow={copy.ideasEyebrow(ideas.length)}
      state={answer === null ? 'loading' : ideas.length === 0 ? 'none' : 'ready'}
      empty={copy.noIdeas()}
      ideas={ideas}
      picked={String(picked)}
      onPick={(key) => setPicked(Number(key))}
      add={{
        label: copy.addLabel(
          chosen === null ? [] : chosen.poi_ids.map((poi) => byId.get(poi)?.name ?? ''),
        ),
        busy,
        onPress: () => {
          if (chosen === null || chosen.kind === 'stay') {
            router.back();
            return;
          }
          setBusy(true);
          void editor.submit(opsFor(chosen)).then((outcome) => {
            setBusy(false);
            if (outcome.kind === 'unavailable') return;
            toast.show({ id: 'plan-gap-added', title: copy.addedToast(freeIds.length) });
            router.back();
          });
        },
      }}
      elseLabel={copy.somethingElse()}
      onElse={() => {
        const href = hrefFor('7d-1', { tripId, scope: 'day', dayId });
        if (href !== undefined) router.replace(href);
      }}
    />
  );
}
