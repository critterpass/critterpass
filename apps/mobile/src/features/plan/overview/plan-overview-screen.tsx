/**
 * The trip plan overview (3e-1) over the synced plan: reads the version I see, lays a pending
 * reorder over it, sweeps days the guide changed, and routes a day to its day view, its open
 * decision, or today's day-of screen during the trip. Organisers reorder directly; a member's drop
 * opens the review screen with the change set it made.
 */
/* eslint-disable lingui/no-unlocalized-strings -- channel names, design ids, toast ids and states, never copy. */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';

import { usePresence } from '@/data/realtime/use-presence';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { toast } from '@/motion/island-toast';
import type { GuideId } from '@/ui/people/GuideLine';

import { ClashList } from '../overlay/clash-card';
import { usePersonalPlan, useResolveClash } from '../overlay/data/use-personal-plan';
import { useDayReorder } from './data/use-day-reorder';
import { useGuideSweep } from './data/use-guide-sweep';
import { todayIn, useDayCards, usePlanData, type PlanData } from './data/use-plan-data';
import type { DropResult } from './day-list';
import { buildDayCards, toPlanState, type DayCard } from './model/plan-model';
import { moveInOrder, movedFixedDay, reorderedPlan } from './model/reorder';
import { PlanOverviewView, type PlanTab } from './plan-overview-view';
import { planRoutes } from './routes';
import { PlanShareSlot } from './share-slot';

const GUIDE_IDS: readonly string[] = ['tokek', 'pon', 'lundi', 'ajo', 'sardi', 'paco'];

export function guideOf(data: PlanData): { id: GuideId; name: string } {
  const slug = data.trip?.guide_slug ?? 'tokek';
  return {
    id: (GUIDE_IDS.includes(slug) ? slug : 'tokek') as GuideId,
    name: data.trip?.guide_name ?? 'Tokek',
  };
}

export interface PlanOverviewScreenProps {
  readonly tripId: string;
  readonly mapView?: (data: PlanData) => ReactNode;
  readonly calendarView?: (data: PlanData, onOpenDay: (dayNo: number) => void) => ReactNode;
}

export function PlanOverviewScreen({ tripId, mapView, calendarView }: PlanOverviewScreenProps) {
  const data = usePlanData(tripId);
  const groupCards = useDayCards(data);
  // My own plan: the crew's with my "just me" changes laid over it.
  const personal = usePersonalPlan(data);
  const resolveClash = useResolveClash();
  const items = personal.items;
  const state = useMemo(() => toPlanState(data.days, data.items), [data.days, data.items]);
  const sync = useSyncStatus();
  const presence = usePresence('trip_presence', tripId);
  const sweep = useGuideSweep(tripId, data.guideChanges, data.items);
  const reorder = useDayReorder({
    tripId,
    versionId: data.versionId,
    organiser: data.organiser,
    state,
  });
  const [tab, setTab] = useState<PlanTab>('list');
  const [shakes, setShakes] = useState<ReadonlyMap<number, number>>(new Map());

  const inTrip = data.trip?.phase === 'in';
  const cards = useMemo(() => {
    const order = reorder.pending;
    if (order === null && !personal.active) return groupCards;
    const plan =
      order === null ? { days: data.days, items } : reorderedPlan(data.days, items, order);
    return buildDayCards({
      days: plan.days,
      items: plan.items,
      polls: data.polls,
      weather: data.weather,
      today: inTrip ? todayIn(data.trip?.tz ?? null) : null,
    });
  }, [reorder.pending, personal.active, groupCards, data, items, inTrip]);

  const memberIndex = new Map(data.members.map((m, index) => [m.user_id, index]));
  const here = presence
    .filter((member) => member.uid !== data.uid)
    .map((member) => ({
      key: member.uid,
      name: member.name ?? '',
      joinIndex: memberIndex.get(member.uid) ?? 0,
    }));

  const openDay = (card: DayCard) => {
    if (card.chip?.kind === 'vote') {
      router.push(planRoutes.decide(tripId, card.chip.pollId));
      return;
    }
    const dayOf = card.when === 'today' ? hrefFor('3k-2', { tripId }) : undefined;
    router.push(dayOf ?? planRoutes.day(tripId, card.dayNo));
  };

  const onReorder = (from: number, to: number): DropResult => {
    const current = cards.map((card) => card.dayNo);
    const next = moveInOrder(current, from, to);
    const locked = new Set(cards.filter((c) => c.fixed || c.when !== 'future').map((c) => c.dayNo));
    const blocked = movedFixedDay(current, next, locked);
    if (blocked !== null) {
      setShakes((prev) => new Map(prev).set(blocked, (prev.get(blocked) ?? 0) + 1));
      toast.show({
        id: `plan-fixed-${blocked}`,
        title: t({
          id: 'plan.overview.fixed',
          message: `Day ${blocked} is booked, so it keeps its date.`,
        }),
      });
      return 'refused';
    }
    // Positions are day numbers; the new order says which day's plan each position takes.
    const byPosition = reorder.pending ?? data.days.map((day) => day.dayNo);
    const order = next.map((dayNo) => byPosition[dayNo - 1] ?? dayNo);
    void reorder.reorder(order).then((outcome) => {
      if (outcome.kind === 'review') router.push(planRoutes.review(tripId, outcome.changesetId));
      if (outcome.kind === 'failed') {
        toast.show({
          id: 'plan-reorder-failed',
          title: data.organiser
            ? t({ id: 'plan.overview.reorderFailed', message: 'That move didn’t go through.' })
            : t({
                id: 'plan.overview.proposeFailed',
                message: 'Suggesting a new order needs signal. Try again in a bit.',
              }),
        });
      }
    });
    return 'moved';
  };

  const status = data.status;
  return (
    <PlanOverviewView
      state={
        status === 'ready'
          ? { kind: 'ready' }
          : status === 'no_plan'
            ? {
                kind: 'no_plan',
                onSetup: data.organiser ? () => router.push(planRoutes.setup(tripId)) : null,
              }
            : { kind: status }
      }
      destination={data.trip?.destination_name ?? null}
      guide={guideOf(data)}
      here={here}
      share={<PlanShareSlot tripId={tripId} />}
      tab={tab}
      onTab={setTab}
      {...(mapView ? { mapView: mapView(data) } : {})}
      {...(calendarView
        ? {
            calendarView: calendarView(data, (dayNo) => {
              const card = cards.find((c) => c.dayNo === dayNo);
              if (card) openDay(card);
            }),
          }
        : {})}
      cards={cards}
      canReorder={!data.readOnly && data.mode === 'group'}
      readOnly={data.readOnly}
      draft={
        data.mode === 'draft' ? { onReview: () => router.push(planRoutes.draft(tripId)) } : null
      }
      offline={sync.phase === 'offline' ? { lastSyncedAt: sync.lastSyncedAt } : null}
      conflict={reorder.conflict ? { onDismiss: reorder.dismissConflict } : null}
      sweepDays={sweep.days}
      onSwept={sweep.markSeen}
      shakes={shakes}
      onOpenDay={openDay}
      onReorder={onReorder}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      footer={
        <ClashList
          clashes={personal.clashes}
          onResolve={(clash, keep) => void resolveClash(clash.personalOpsId, keep)}
        />
      }
    />
  );
}
